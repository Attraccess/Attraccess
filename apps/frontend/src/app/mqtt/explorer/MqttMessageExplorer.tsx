// Live MQTT message explorer for any configured server: a log of the messages
// matching a topic filter plus a publish form. The stream runs through the
// live-updates transport and is held only while it is live: subscribed, not
// paused, tab visible and the component mounted — so the server never pushes
// messages nobody sees.
import {
  Button,
  EmptyState,
  StatusAlert,
  useDateTimeFormatter,
  useNumberFormatter,
  useTranslations,
} from '@attraccess/plugins-frontend-ui';
import { Checkbox, FieldError, Input, Label, ListBox, Select, TextArea, TextField } from '@heroui/react';
import { useMqttServiceMqttExplorerPublish } from '@attraccess/react-query-client';
import { MessagesSquareIcon, PauseIcon, PlayIcon, SendIcon, Trash2Icon } from 'lucide-react';
import { memo, useCallback, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { useLiveUpdates } from '../../../utils/live-updates';
import type { MqttExplorerLiveEvent, MqttExplorerLiveMessage } from '../../../utils/live-updates/types';
import { decodePayload, type DecodedPayload } from './payload';
import { isPublishablePayload, isPublishableTopic, isValidTopicFilter, type TopicSuggestions } from './topics';
import de from './de.json';
import en from './en.json';

// Newest messages are kept; older ones fall off the end of the log.
export const MESSAGE_LOG_CAP = 500;

const TIME_ONLY = { showDate: false, showSeconds: true };
// Shared empty lists keep the memoised children's props stable.
const NO_TOPICS: string[] = [];
const QOS_LEVELS = ['0', '1', '2'] as const;

export interface MqttMessageExplorerProps {
  mqttServerId: number;
  /** Topics offered as one-press chips for the filter and publish fields. */
  topicSuggestions?: TopicSuggestions;
  /** Narrow layout, for a side panel. */
  compact?: boolean;
}

// A received message, decoded once when its batch arrives.
interface LogEntry {
  id: number;
  topic: string;
  size: number;
  truncated: boolean;
  receivedAt: number;
  decoded: DecodedPayload;
}

function toLogEntry(message: MqttExplorerLiveMessage, id: number): LogEntry {
  return {
    id,
    topic: message.topic,
    size: message.size,
    truncated: message.truncated,
    receivedAt: message.receivedAt,
    decoded: decodePayload(message.payload, message.truncated),
  };
}

const MessageRow = memo(function MessageRow({ entry }: { entry: LogEntry }) {
  const { t } = useTranslations({ en, de }, { escapeValues: false });
  const formatNumber = useNumberFormatter();
  const formatTime = useDateTimeFormatter(TIME_ONLY);
  return (
    // content-visibility skips layout and paint of the rows scrolled out of view.
    <li
      className="flex flex-col gap-1 border-b border-separator py-2 [content-visibility:auto] [contain-intrinsic-size:auto_4rem]"
      data-cy="mqtt-explorer-message-row"
    >
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
        <span>{String(formatTime(entry.receivedAt, ''))}</span>
        {/* Plain text, not a chip: a long topic must wrap inside the narrow panel. */}
        <span className="max-w-full break-all font-medium text-foreground">{entry.topic}</span>
        <span>{t('size', { size: formatNumber(entry.size) })}</span>
        {entry.decoded.kind === 'binary' && <span>{t('binary')}</span>}
        {(entry.truncated || entry.decoded.clipped) && <span>{t('truncated')}</span>}
      </div>
      <pre className="whitespace-pre-wrap break-all text-sm">{entry.decoded.text}</pre>
    </li>
  );
});

function subscribeVisibility(onChange: () => void) {
  document.addEventListener('visibilitychange', onChange);
  return () => document.removeEventListener('visibilitychange', onChange);
}

function usePageVisible(): boolean {
  return useSyncExternalStore(
    subscribeVisibility,
    () => document.visibilityState !== 'hidden',
    () => true,
  );
}

// One live subscription. The parent renders it keyed by a generation that
// bumps on every Subscribe / Apply filter, so each press opens a new
// subscription even for an unchanged filter (e.g. after the stream failed).
function LiveSubscription({
  mqttServerId,
  filter,
  enabled,
  onUpdate,
  onUnavailable,
}: {
  mqttServerId: number;
  filter: string;
  enabled: boolean;
  onUpdate: (event: MqttExplorerLiveEvent) => void;
  onUnavailable: () => void;
}) {
  useLiveUpdates({ topic: 'mqtt-messages', mqttServerId, filter, enabled, onUpdate, onUnavailable });
  return null;
}

const SuggestionChips = memo(function SuggestionChips({
  values,
  onPick,
}: {
  values: string[];
  onPick: (value: string) => void;
}) {
  const { t } = useTranslations({ en, de }, { escapeValues: false });
  if (values.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-1" role="group" aria-label={t('suggestions')}>
      {values.map((value) => (
        <Button key={value} size="sm" variant="secondary" onPress={() => onPick(value)}>
          {value}
        </Button>
      ))}
    </div>
  );
});

const PublishForm = memo(function PublishForm({
  mqttServerId,
  suggestions,
}: {
  mqttServerId: number;
  suggestions: string[];
}) {
  const { t } = useTranslations({ en, de }, { escapeValues: false });
  const [topic, setTopic] = useState('');
  const [payload, setPayload] = useState('');
  const [qos, setQos] = useState<0 | 1 | 2>(0);
  const [retain, setRetain] = useState(false);
  const [publishResult, setPublishResult] = useState<{ ok: boolean; message: string } | null>(null);
  const publishMessage = useMqttServiceMqttExplorerPublish();
  const qosItems = useMemo(
    () =>
      QOS_LEVELS.map((value) => (
        <ListBox.Item key={value} id={value} textValue={t('qosOption', { qos: value })}>
          {t('qosOption', { qos: value })}
          <ListBox.ItemIndicator />
        </ListBox.Item>
      )),
    [t],
  );

  const payloadTooLarge = !isPublishablePayload(payload);
  const publishable = isPublishableTopic(topic) && !payloadTooLarge;
  const topicInvalid = topic.length > 0 && !isPublishableTopic(topic);

  const publish = async () => {
    setPublishResult(null);
    try {
      await publishMessage.mutateAsync({ id: mqttServerId, requestBody: { topic, payload, qos, retain } });
      setPublishResult({ ok: true, message: t('published') });
    } catch {
      // The API's own error text is English and generic; show the translated one.
      setPublishResult({ ok: false, message: t('publishError') });
    }
  };

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border p-3">
      <h4 className="text-sm font-semibold">{t('publishTitle')}</h4>
      <p className="text-xs text-muted">{t('publishHint')}</p>
      <TextField
        value={topic}
        onChange={(value) => {
          setTopic(value);
          setPublishResult(null);
        }}
        isInvalid={topicInvalid}
        className="w-full"
      >
        <Label>{t('topic')}</Label>
        <Input autoComplete="off" data-cy="mqtt-explorer-publish-topic-input" />
        <FieldError>{t('topicInvalid')}</FieldError>
      </TextField>
      <SuggestionChips
        values={suggestions}
        onPick={(value) => {
          setTopic(value);
          setPublishResult(null);
        }}
      />
      <TextField
        value={payload}
        onChange={(value) => {
          setPayload(value);
          setPublishResult(null);
        }}
        isInvalid={payloadTooLarge}
        className="w-full"
      >
        <Label>{t('payload')}</Label>
        <TextArea rows={3} data-cy="mqtt-explorer-publish-payload-input" />
        <FieldError>{t('payloadTooLarge')}</FieldError>
      </TextField>
      <div className="flex flex-row flex-wrap items-end gap-3">
        <Select
          value={String(qos)}
          onChange={(key) => {
            if (key != null) setQos(Number(key) as 0 | 1 | 2);
          }}
          className="w-32"
        >
          <Label>{t('qos')}</Label>
          <Select.Trigger data-cy="mqtt-explorer-publish-qos-select">
            <Select.Value />
            <Select.Indicator />
          </Select.Trigger>
          <Select.Popover>
            <ListBox>{qosItems}</ListBox>
          </Select.Popover>
        </Select>
        <Checkbox isSelected={retain} onChange={setRetain} data-cy="mqtt-explorer-publish-retain-checkbox">
          <Checkbox.Content>
            <Checkbox.Control>
              <Checkbox.Indicator />
            </Checkbox.Control>
            {t('retain')}
          </Checkbox.Content>
        </Checkbox>
        <Button
          variant="primary"
          onPress={() => void publish()}
          isDisabled={!publishable}
          isPending={publishMessage.isPending}
          data-cy="mqtt-explorer-publish-button"
        >
          <SendIcon className="w-4 h-4" />
          {t('publish')}
        </Button>
      </div>
      {/* Live regions stay mounted so screen readers announce the result when it appears. */}
      <div role="status">
        {publishResult?.ok && (
          <StatusAlert status="success" data-cy="mqtt-explorer-publish-result">
            {publishResult.message}
          </StatusAlert>
        )}
      </div>
      <div role="alert">
        {publishResult && !publishResult.ok && (
          <StatusAlert status="danger" data-cy="mqtt-explorer-publish-result">
            {publishResult.message}
          </StatusAlert>
        )}
      </div>
    </div>
  );
});

export const MqttMessageExplorer = memo(function MqttMessageExplorer({
  mqttServerId,
  topicSuggestions,
  compact = false,
}: MqttMessageExplorerProps) {
  const { t } = useTranslations({ en, de }, { escapeValues: false });
  const formatNumber = useNumberFormatter();
  const visible = usePageVisible();

  const [filter, setFilter] = useState(topicSuggestions?.filters[0] ?? '#');
  const [subscribedFilter, setSubscribedFilter] = useState<string | null>(null);
  const [generation, setGeneration] = useState(0);
  const [paused, setPaused] = useState(false);
  const nextId = useRef(0);
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [dropped, setDropped] = useState(0);
  const [unavailable, setUnavailable] = useState(false);
  const [shownServerId, setShownServerId] = useState(mqttServerId);

  // Another server: a fresh subscription (when one was running) and an empty log,
  // reset during render so nothing of the previous server's log is ever committed.
  if (shownServerId !== mqttServerId) {
    setShownServerId(mqttServerId);
    setEntries([]);
    setDropped(0);
    setUnavailable(false);
    setPaused(false);
    setGeneration((current) => current + 1);
  }

  const onUpdate = useCallback((event: MqttExplorerLiveEvent) => {
    setUnavailable(false);
    setDropped((total) => total + event.dropped);
    // Batches arrive oldest-first; the log shows newest first. Only what fits
    // in the log is decoded.
    const fresh = event.messages
      .slice(-MESSAGE_LOG_CAP)
      .map((message) => toLogEntry(message, nextId.current++))
      .reverse();
    setEntries((current) => [...fresh, ...current].slice(0, MESSAGE_LOG_CAP));
  }, []);
  const onUnavailable = useCallback(() => setUnavailable(true), []);

  const subscribe = () => {
    setEntries([]);
    setDropped(0);
    setUnavailable(false);
    setPaused(false);
    setSubscribedFilter(filter.trim() === '' ? '#' : filter.trim());
    setGeneration((current) => current + 1);
  };

  const filterInvalid = filter.trim() !== '' && !isValidTopicFilter(filter.trim());

  return (
    <section data-cy={`mqtt-explorer-${mqttServerId}`} className="w-full flex flex-col gap-4">
      {subscribedFilter !== null && (
        <LiveSubscription
          key={generation}
          mqttServerId={mqttServerId}
          filter={subscribedFilter}
          enabled={!paused && visible}
          onUpdate={onUpdate}
          onUnavailable={onUnavailable}
        />
      )}
      <div className="flex flex-row items-center gap-2">
        <MessagesSquareIcon className="w-5 h-5 text-accent-soft-foreground" />
        <h3 className="text-sm uppercase tracking-wide font-semibold">{t('title')}</h3>
      </div>
      <div className="flex flex-col gap-4">
        <div className="flex flex-row flex-wrap items-end gap-2">
          <TextField value={filter} onChange={setFilter} isInvalid={filterInvalid} className="grow">
            <Label>{t('filter')}</Label>
            <Input autoComplete="off" placeholder="#" data-cy="mqtt-explorer-filter-input" />
            <FieldError>{t('filterInvalid')}</FieldError>
          </TextField>
          {subscribedFilter === null ? (
            <Button variant="primary" onPress={subscribe} isDisabled={filterInvalid} data-cy="mqtt-explorer-subscribe">
              {t('subscribe')}
            </Button>
          ) : (
            <>
              <Button
                variant="secondary"
                onPress={subscribe}
                isDisabled={filterInvalid}
                data-cy="mqtt-explorer-resubscribe"
              >
                {t('resubscribe')}
              </Button>
              <Button variant="secondary" onPress={() => setPaused(!paused)} data-cy="mqtt-explorer-pause">
                {paused ? <PlayIcon className="w-4 h-4" /> : <PauseIcon className="w-4 h-4" />}
                {paused ? t('resume') : t('pause')}
              </Button>
              <Button
                variant="secondary"
                onPress={() => {
                  setEntries([]);
                  setDropped(0);
                }}
                data-cy="mqtt-explorer-clear"
              >
                <Trash2Icon className="w-4 h-4" />
                {t('clear')}
              </Button>
              <Button variant="secondary" onPress={() => setSubscribedFilter(null)} data-cy="mqtt-explorer-unsubscribe">
                {t('unsubscribe')}
              </Button>
            </>
          )}
        </div>
        <SuggestionChips values={topicSuggestions?.filters ?? NO_TOPICS} onPick={setFilter} />

        {unavailable && (
          <div role="status">
            <StatusAlert status="warning">{t('unavailable')}</StatusAlert>
          </div>
        )}
        {dropped > 0 && (
          <div role="status">
            <StatusAlert status="warning">
              {t('dropped', { count: dropped, formattedCount: formatNumber(dropped) })}
            </StatusAlert>
          </div>
        )}
        {paused && (
          <div role="status">
            <StatusAlert status="default">{t('pausedNotice')}</StatusAlert>
          </div>
        )}

        {subscribedFilter !== null &&
          (entries.length === 0 ? (
            <div role="status">
              <EmptyState message={t('waiting', { filter: subscribedFilter })} />
            </div>
          ) : (
            // A log, but not a live one: announcing every message would drown a screen reader.
            <div
              role="log"
              aria-live="off"
              aria-label={t('log')}
              className={compact ? 'max-h-72 overflow-auto' : 'max-h-96 overflow-auto'}
            >
              <ul data-cy="mqtt-explorer-log">
                {entries.map((entry) => (
                  <MessageRow key={entry.id} entry={entry} />
                ))}
              </ul>
            </div>
          ))}

        <PublishForm
          key={mqttServerId}
          mqttServerId={mqttServerId}
          suggestions={topicSuggestions?.topics ?? NO_TOPICS}
        />
      </div>
    </section>
  );
});
