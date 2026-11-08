// Message explorer for the MQTT server detail slot (ATT-525), manage tier only:
// a live log of the messages matching a topic filter plus a publish form. The
// stream runs through the host's live-updates transport. It is held only while
// the log is subscribed, not paused and the tab is visible, and released on
// unsubscribe and unmount, so the server never pushes messages nobody sees.
import { usePluginLiveUpdates } from '@attraccess/plugins-frontend-sdk';
import { Button, EmptyState, StatusAlert } from '@attraccess/plugins-frontend-ui';
import { Card, Checkbox, Chip, FieldError, Input, Label, ListBox, Select, TextArea, TextField } from '@heroui/react';
import { MessagesSquareIcon, PauseIcon, PlayIcon, SendIcon, Trash2Icon } from 'lucide-react';
import { memo, useCallback, useRef, useState, useSyncExternalStore } from 'react';
import { useRabbitmqFormatters } from '../format';
import { useRabbitmqTranslations } from '../i18n';
import { decodePayload, type DecodedPayload } from './payload';
import {
  isPublishableTopic,
  isValidTopicFilter,
  liveIdentifier,
  publishMessage,
  type RabbitmqLiveEvent,
  type RabbitmqLiveMessage,
} from './messages-api';

// Newest messages are kept; older ones fall off the end of the log.
export const MESSAGE_LOG_CAP = 500;

// A received message, decoded once when its batch arrives.
interface LogEntry {
  id: number;
  topic: string;
  size: number;
  truncated: boolean;
  receivedAt: number;
  decoded: DecodedPayload;
}

function toLogEntry(message: RabbitmqLiveMessage, id: number): LogEntry {
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
  const { t } = useRabbitmqTranslations();
  const format = useRabbitmqFormatters();
  return (
    <li
      className="rmq:flex rmq:flex-col rmq:gap-1 rmq:border-b rmq:border-default-200 rmq:py-2"
      data-cy="rabbitmq-message-row"
    >
      <div className="rmq:flex rmq:flex-wrap rmq:items-center rmq:gap-2 rmq:text-xs rmq:text-default-500">
        <span>{format.time(entry.receivedAt)}</span>
        <Chip size="sm" variant="soft">
          {entry.topic}
        </Chip>
        <span>{t('messages.size', { size: format.number(entry.size) })}</span>
        {entry.decoded.kind === 'binary' && <span>{t('messages.binary')}</span>}
        {(entry.truncated || entry.decoded.clipped) && <span>{t('messages.truncated')}</span>}
      </div>
      <pre className="rmq:whitespace-pre-wrap rmq:break-all rmq:text-sm">{entry.decoded.text}</pre>
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
  onUpdate: (event: RabbitmqLiveEvent) => void;
  onUnavailable: () => void;
}) {
  usePluginLiveUpdates<RabbitmqLiveEvent>({
    plugin: 'rabbitmq',
    topic: 'messages',
    identifier: liveIdentifier(mqttServerId, filter),
    enabled,
    onUpdate,
    onUnavailable,
  });
  return null;
}

function PublishForm({ mqttServerId }: { mqttServerId: number }) {
  const { t } = useRabbitmqTranslations();
  const [topic, setTopic] = useState('');
  const [payload, setPayload] = useState('');
  const [qos, setQos] = useState<0 | 1 | 2>(0);
  const [retain, setRetain] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [publishResult, setPublishResult] = useState<{ ok: boolean; message: string } | null>(null);

  const publishable = isPublishableTopic(topic);
  const topicInvalid = topic.length > 0 && !publishable;

  const publish = async () => {
    setPublishing(true);
    setPublishResult(null);
    try {
      await publishMessage(mqttServerId, { topic, payload, qos, retain });
      setPublishResult({ ok: true, message: t('messages.published') });
    } catch (err) {
      setPublishResult({
        ok: false,
        message: err instanceof Error && err.message ? err.message : t('messages.publishError'),
      });
    } finally {
      setPublishing(false);
    }
  };

  return (
    <div className="rmq:flex rmq:flex-col rmq:gap-3 rmq:rounded-lg rmq:border rmq:border-default-200 rmq:dark:border-default-100 rmq:p-3">
      <p className="rmq:text-sm rmq:font-semibold rmq:text-default-700">{t('messages.publishTitle')}</p>
      <TextField
        value={topic}
        onChange={(value) => {
          setTopic(value);
          setPublishResult(null);
        }}
        isInvalid={topicInvalid}
        className="rmq:w-full"
      >
        <Label>{t('messages.topic')}</Label>
        <Input autoComplete="off" data-cy="rabbitmq-messages-topic-input" />
        <FieldError>{t('messages.topicInvalid')}</FieldError>
      </TextField>
      <TextField
        value={payload}
        onChange={(value) => {
          setPayload(value);
          setPublishResult(null);
        }}
        className="rmq:w-full"
      >
        <Label>{t('messages.payload')}</Label>
        <TextArea rows={3} data-cy="rabbitmq-messages-payload-input" />
      </TextField>
      <div className="rmq:flex rmq:flex-row rmq:flex-wrap rmq:items-end rmq:gap-3">
        <Select
          value={String(qos)}
          onChange={(key) => {
            if (key != null) setQos(Number(key) as 0 | 1 | 2);
          }}
          className="rmq:w-32"
        >
          <Label>{t('messages.qos')}</Label>
          <Select.Trigger data-cy="rabbitmq-messages-qos-select">
            <Select.Value />
            <Select.Indicator />
          </Select.Trigger>
          <Select.Popover>
            <ListBox>
              {['0', '1', '2'].map((value) => (
                <ListBox.Item key={value} id={value} textValue={t('messages.qosOption', { qos: value })}>
                  {t('messages.qosOption', { qos: value })}
                  <ListBox.ItemIndicator />
                </ListBox.Item>
              ))}
            </ListBox>
          </Select.Popover>
        </Select>
        <Checkbox isSelected={retain} onChange={setRetain} data-cy="rabbitmq-messages-retain-checkbox">
          <Checkbox.Content>
            <Checkbox.Control>
              <Checkbox.Indicator />
            </Checkbox.Control>
            {t('messages.retain')}
          </Checkbox.Content>
        </Checkbox>
        <Button
          variant="primary"
          onPress={() => void publish()}
          isDisabled={!publishable}
          isPending={publishing}
          data-cy="rabbitmq-messages-publish-button"
        >
          <SendIcon className="rmq:w-4 rmq:h-4" />
          {t('messages.publish')}
        </Button>
      </div>
      {publishResult && (
        <StatusAlert status={publishResult.ok ? 'success' : 'danger'} data-cy="rabbitmq-messages-publish-result">
          {publishResult.message}
        </StatusAlert>
      )}
    </div>
  );
}

export function RabbitmqMessagesPanel({ mqttServerId }: { mqttServerId: number }) {
  const { t } = useRabbitmqTranslations();
  const visible = usePageVisible();

  const [filter, setFilter] = useState('#');
  const [subscribedFilter, setSubscribedFilter] = useState<string | null>(null);
  const [generation, setGeneration] = useState(0);
  const [paused, setPaused] = useState(false);
  const nextId = useRef(0);
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [dropped, setDropped] = useState(0);
  const [unavailable, setUnavailable] = useState(false);

  const onUpdate = useCallback((event: RabbitmqLiveEvent) => {
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
    <Card
      data-cy={`rabbitmq-messages-panel-${mqttServerId}`}
      className="rmq:w-full rmq:border rmq:border-default-200 rmq:dark:border-default-100"
    >
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
      <Card.Header className="rmq:flex rmq:flex-row rmq:items-center rmq:gap-2">
        <MessagesSquareIcon className="rmq:w-5 rmq:h-5 rmq:text-accent-soft-foreground" />
        <p className="rmq:text-base rmq:font-semibold rmq:text-default-700">{t('messages.title')}</p>
      </Card.Header>
      <Card.Content className="rmq:flex rmq:flex-col rmq:gap-4">
        <div className="rmq:flex rmq:flex-row rmq:flex-wrap rmq:items-end rmq:gap-2">
          <TextField value={filter} onChange={setFilter} isInvalid={filterInvalid} className="rmq:grow">
            <Label>{t('messages.filter')}</Label>
            <Input autoComplete="off" placeholder="#" data-cy="rabbitmq-messages-filter-input" />
            <FieldError>{t('messages.filterInvalid')}</FieldError>
          </TextField>
          {subscribedFilter === null ? (
            <Button
              variant="primary"
              onPress={subscribe}
              isDisabled={filterInvalid}
              data-cy="rabbitmq-messages-subscribe-button"
            >
              {t('messages.subscribe')}
            </Button>
          ) : (
            <>
              <Button
                variant="secondary"
                onPress={subscribe}
                isDisabled={filterInvalid}
                data-cy="rabbitmq-messages-resubscribe-button"
              >
                {t('messages.resubscribe')}
              </Button>
              <Button variant="secondary" onPress={() => setPaused(!paused)} data-cy="rabbitmq-messages-pause-button">
                {paused ? <PlayIcon className="rmq:w-4 rmq:h-4" /> : <PauseIcon className="rmq:w-4 rmq:h-4" />}
                {paused ? t('messages.resume') : t('messages.pause')}
              </Button>
              <Button
                variant="secondary"
                onPress={() => {
                  setEntries([]);
                  setDropped(0);
                }}
                data-cy="rabbitmq-messages-clear-button"
              >
                <Trash2Icon className="rmq:w-4 rmq:h-4" />
                {t('messages.clear')}
              </Button>
              <Button
                variant="secondary"
                onPress={() => setSubscribedFilter(null)}
                data-cy="rabbitmq-messages-unsubscribe-button"
              >
                {t('messages.unsubscribe')}
              </Button>
            </>
          )}
        </div>

        {unavailable && <StatusAlert status="warning">{t('messages.unavailable')}</StatusAlert>}
        {dropped > 0 && <StatusAlert status="warning">{t('messages.dropped', { count: dropped })}</StatusAlert>}
        {paused && <StatusAlert status="default">{t('messages.pausedNotice')}</StatusAlert>}

        {subscribedFilter !== null &&
          (entries.length === 0 ? (
            <EmptyState message={t('messages.waiting', { filter: subscribedFilter })} />
          ) : (
            <ul className="rmq:max-h-96 rmq:overflow-auto" data-cy="rabbitmq-messages-log">
              {entries.map((entry) => (
                <MessageRow key={entry.id} entry={entry} />
              ))}
            </ul>
          ))}

        <PublishForm mqttServerId={mqttServerId} />
      </Card.Content>
    </Card>
  );
}
