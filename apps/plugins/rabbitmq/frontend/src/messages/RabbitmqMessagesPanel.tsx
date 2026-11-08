// Message explorer for the MQTT server detail slot (ATT-525), manage tier only:
// a live log of the messages matching a topic filter plus a publish form. The
// stream runs through the host's live-updates transport; it is released when
// the user unsubscribes or the panel unmounts.
import { usePluginLiveUpdates } from '@attraccess/plugins-frontend-sdk';
import { Button, EmptyState, StatusAlert } from '@attraccess/plugins-frontend-ui';
import { Card, Chip, Input, Label, ListBox, Select, TextArea, TextField } from '@heroui/react';
import { MessagesSquareIcon, PauseIcon, PlayIcon, SendIcon, Trash2Icon } from 'lucide-react';
import { useCallback, useRef, useState } from 'react';
import { useRabbitmqTranslations } from '../i18n';
import { decodePayload } from './payload';
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

interface LogEntry extends RabbitmqLiveMessage {
  id: number;
}

function MessageRow({ entry }: { entry: LogEntry }) {
  const { t, language } = useRabbitmqTranslations();
  const decoded = decodePayload(entry.payload);
  return (
    <li
      className="rmq:flex rmq:flex-col rmq:gap-1 rmq:border-b rmq:border-default-200 rmq:py-2"
      data-cy="rabbitmq-message-row"
    >
      <div className="rmq:flex rmq:flex-wrap rmq:items-center rmq:gap-2 rmq:text-xs rmq:text-default-500">
        <span>{new Date(entry.receivedAt).toLocaleTimeString(language)}</span>
        <Chip size="sm" variant="soft">
          {entry.topic}
        </Chip>
        <span>{t('messages.size', { size: entry.size })}</span>
        {decoded.kind === 'binary' && <span>{t('messages.binary')}</span>}
        {entry.truncated && <span>{t('messages.truncated')}</span>}
      </div>
      <pre className="rmq:whitespace-pre-wrap rmq:break-all rmq:text-sm">{decoded.text}</pre>
    </li>
  );
}

export function RabbitmqMessagesPanel({ mqttServerId }: { mqttServerId: number }) {
  const { t } = useRabbitmqTranslations();

  const [filter, setFilter] = useState('#');
  const [subscribedFilter, setSubscribedFilter] = useState<string | null>(null);
  const [paused, setPaused] = useState(false);
  const pausedRef = useRef(false);
  const nextId = useRef(0);
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [dropped, setDropped] = useState(0);
  const [unavailable, setUnavailable] = useState(false);

  const [topic, setTopic] = useState('');
  const [payload, setPayload] = useState('');
  const [qos, setQos] = useState<0 | 1 | 2>(0);
  const [retain, setRetain] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [publishResult, setPublishResult] = useState<{ ok: boolean; message: string } | null>(null);

  const onUpdate = useCallback((event: RabbitmqLiveEvent) => {
    if (event.eventType === 'unavailable') {
      setUnavailable(true);
      return;
    }
    if (pausedRef.current) return;
    setUnavailable(false);
    setDropped((total) => total + event.dropped);
    // Batches arrive oldest-first; the log shows newest first.
    const fresh = event.messages.map((message) => ({ ...message, id: nextId.current++ })).reverse();
    setEntries((current) => [...fresh, ...current].slice(0, MESSAGE_LOG_CAP));
  }, []);

  usePluginLiveUpdates<RabbitmqLiveEvent>({
    plugin: 'rabbitmq',
    topic: 'messages',
    identifier: subscribedFilter === null ? undefined : liveIdentifier(mqttServerId, subscribedFilter),
    enabled: subscribedFilter !== null,
    onUpdate,
    onUnavailable: () => setUnavailable(true),
  });

  const togglePause = () => {
    pausedRef.current = !paused;
    setPaused(!paused);
  };

  const subscribe = () => {
    setEntries([]);
    setDropped(0);
    setUnavailable(false);
    pausedRef.current = false;
    setPaused(false);
    setSubscribedFilter(filter.trim() === '' ? '#' : filter.trim());
  };

  const filterInvalid = filter.trim() !== '' && !isValidTopicFilter(filter.trim());
  const topicInvalid = topic.length > 0 && !isPublishableTopic(topic);

  const publish = async () => {
    if (!isPublishableTopic(topic)) {
      setPublishResult({ ok: false, message: t('messages.topicInvalid') });
      return;
    }
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
    <Card
      data-cy={`rabbitmq-messages-panel-${mqttServerId}`}
      className="rmq:w-full rmq:border rmq:border-default-200 rmq:dark:border-default-100"
    >
      <Card.Header className="rmq:flex rmq:items-center rmq:gap-2">
        <MessagesSquareIcon className="rmq:w-5 rmq:h-5 rmq:text-accent-soft-foreground" />
        <p className="rmq:text-base rmq:font-semibold rmq:text-default-700">{t('messages.title')}</p>
      </Card.Header>
      <Card.Content className="rmq:flex rmq:flex-col rmq:gap-4">
        <div className="rmq:flex rmq:flex-row rmq:flex-wrap rmq:items-end rmq:gap-2">
          <TextField value={filter} onChange={setFilter} isInvalid={filterInvalid} className="rmq:grow">
            <Label>{t('messages.filter')}</Label>
            <Input autoComplete="off" placeholder="#" data-cy="rabbitmq-messages-filter-input" />
            {filterInvalid && <p className="rmq:text-xs rmq:text-danger">{t('messages.filterInvalid')}</p>}
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
              <Button variant="secondary" onPress={togglePause} data-cy="rabbitmq-messages-pause-button">
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
                variant="danger"
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

        <div className="rmq:flex rmq:flex-col rmq:gap-3 rmq:rounded-lg rmq:border rmq:border-default-200 rmq:dark:border-default-100 rmq:p-3">
          <p className="rmq:text-sm rmq:font-semibold rmq:text-default-700">{t('messages.publishTitle')}</p>
          <TextField value={topic} onChange={setTopic} isInvalid={topicInvalid} className="rmq:w-full">
            <Label>{t('messages.topic')}</Label>
            <Input autoComplete="off" data-cy="rabbitmq-messages-topic-input" />
          </TextField>
          {topicInvalid && <p className="rmq:text-xs rmq:text-danger">{t('messages.topicInvalid')}</p>}
          <TextField value={payload} onChange={setPayload} className="rmq:w-full">
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
                    <ListBox.Item key={value} id={value} textValue={`QoS ${value}`}>
                      QoS {value}
                      <ListBox.ItemIndicator />
                    </ListBox.Item>
                  ))}
                </ListBox>
              </Select.Popover>
            </Select>
            <label className="rmq:flex rmq:items-center rmq:gap-2 rmq:text-sm">
              <input
                type="checkbox"
                checked={retain}
                onChange={(event) => setRetain(event.target.checked)}
                data-cy="rabbitmq-messages-retain-checkbox"
              />
              {t('messages.retain')}
            </label>
            <Button
              variant="primary"
              onPress={() => void publish()}
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
      </Card.Content>
    </Card>
  );
}
