import { Button, Card, CardContent, CardHeader } from '@heroui/react';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { InviteProjectMemberModal } from '../inviteMemberModal';
import { UserPlus2Icon } from 'lucide-react';
import en from './en.json';
import de from './de.json';

type TeamInviteCardProps = {
  projectId: number;
  isOwner: boolean;
};

export function TeamInviteCard(props: Readonly<TeamInviteCardProps>) {
  const { projectId, isOwner } = props;
  const { t } = useTranslations({ en, de });

  if (!isOwner) {
    return null;
  }

  return (
    <Card>
      <CardHeader className="flex flex-col gap-2">
        <p className="text-large font-semibold">{t('sections.invite.title')}</p>
        <p className="text-small text-default-500">{t('sections.invite.description')}</p>
      </CardHeader>
      <CardContent>
        <InviteProjectMemberModal projectId={projectId}>
          {(onOpen) => (
            <Button variant="primary" onPress={onOpen}><UserPlus2Icon className="size-4" />
              {t('sections.invite.cta')}
            </Button>
          )}
        </InviteProjectMemberModal>
      </CardContent>
    </Card>
  );
}

