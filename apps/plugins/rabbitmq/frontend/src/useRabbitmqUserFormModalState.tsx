import { useEffect, useState } from 'react';
import { DEFAULT_MQTT_PERMISSIONS, upsertUser, type UpsertRabbitmqUserBody } from './users-api';
import { useRabbitmqTranslations } from './i18n';
import type { TranslationMessage } from '@attraccess/plugins-frontend-ui';
import { RabbitmqUserFormModalProps } from './RabbitmqUserFormModal.rabbitmq-user-form-modal-props';
import { parseTags } from './RabbitmqUserFormModal.parse-tags';
export function useRabbitmqUserFormModalState({
  mqttServerId,
  isOpen,
  user,
  vhosts,
  onClose,
  onSaved,
}: RabbitmqUserFormModalProps) {
  const { t, tMessage } = useRabbitmqTranslations();
  const isEdit = user !== null;

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [tags, setTags] = useState('');
  const [grantMqttDefaults, setGrantMqttDefaults] = useState(true);
  const [vhost, setVhost] = useState('/');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | TranslationMessage | null>(null);

  // Re-seed the form whenever it opens (for another user, or again after a
  // cancel) — modal state outlives a single open/close cycle.
  useEffect(() => {
    if (!isOpen) {
      return;
    }
    setUsername(user?.name ?? '');
    setPassword('');
    setTags(user?.tags.join(', ') ?? '');
    setGrantMqttDefaults(true);
    setVhost(vhosts.includes('/') || vhosts.length === 0 ? '/' : vhosts[0]);
    setError(null);
  }, [isOpen, user, vhosts]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = username.trim();
    if (name.length === 0) {
      setError({ key: 'form.usernameRequired' });
      return;
    }
    if (!isEdit && password.length === 0) {
      setError({ key: 'form.passwordRequired' });
      return;
    }

    const body: UpsertRabbitmqUserBody = { tags: parseTags(tags) };
    if (password.length > 0) {
      body.password = password;
    }
    if (!isEdit && grantMqttDefaults && vhost.trim().length > 0) {
      body.permissions = [{ vhost: vhost.trim(), ...DEFAULT_MQTT_PERMISSIONS }];
    }

    setSaving(true);
    setError(null);
    try {
      await upsertUser(mqttServerId, name, body);
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : { key: 'form.saveError' });
    } finally {
      setSaving(false);
    }
  };
  return {
    t,
    tMessage,
    isEdit,
    username,
    setUsername,
    password,
    setPassword,
    tags,
    setTags,
    grantMqttDefaults,
    setGrantMqttDefaults,
    vhost,
    setVhost,
    saving,
    error,
    handleSubmit,
    mqttServerId,
    isOpen,
    user,
    vhosts,
    onClose,
  } as const;
}
