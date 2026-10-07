import {
  DrawerBody,
  DrawerFooter,
  DrawerHeader,
  Form,
  TextField,
  Label,
  Input,
  Tab,
  TabList,
  TabPanel,
  Tabs,
} from '@heroui/react';
import { Button } from '../../../components/button';
import { StandardDrawer } from '../../../components/standardDrawer';
import { ApiError } from '@attraccess/react-query-client';
import { CsvInvite } from './csv-invite';
import { UsernameInput, USERNAME_RULES } from '../../../components/UsernameInput';
import { useInviteUserModalState } from './useInviteUserModalState';

export interface Props {
  children: (onOpen: () => void) => React.ReactNode;
}

export function InviteUserModal(props: Props) {
  const {
    children,
    isOpen,
    open,
    close,
    t,
    tExists,
    toast,
    username,
    setUsername,
    email,
    setEmail,
    formRef,
    usernameValidationMessages,
    canSubmit,
    isPending,
    onSubmit,
    tab,
    setTab,
  } = useInviteUserModalState(props);

  return (
    <>
      {children(open)}
      <StandardDrawer
        isOpen={isOpen}
        onOpenChange={(o) => {
          if (!o) close();
        }}
        dialogProps={{ 'aria-label': t('title') }}
      >
        <DrawerHeader>
          <h2 className="text-lg font-semibold">{t('title')}</h2>
        </DrawerHeader>
        <DrawerBody>
          <Tabs selectedKey={tab} onSelectionChange={(k) => setTab(k as 'single' | 'csv')}>
            <Tabs.ListContainer>
              <TabList>
                <Tab id="single">
                  <Tabs.Indicator />
                  {t('tabs.single')}
                </Tab>
                <Tab id="csv">
                  <Tabs.Indicator />
                  {t('tabs.csv')}
                </Tab>
              </TabList>
            </Tabs.ListContainer>
            <TabPanel id="single">
              <Form
                ref={formRef}
                onSubmit={(e) => {
                  e.preventDefault();
                  onSubmit();
                }}
                className="flex flex-col gap-4"
              >
                <UsernameInput
                  label={t('inputs.username.label')}
                  name="username"
                  isRequired
                  value={username}
                  onChange={setUsername}
                  validationMessages={usernameValidationMessages}
                  description={t('inputs.username.description', {
                    min: USERNAME_RULES.minLength,
                    max: USERNAME_RULES.maxLength,
                  })}
                />
                <TextField isRequired value={email} onChange={setEmail}>
                  <Label>{t('inputs.email.label')}</Label>
                  <Input name="email" type="email" required />
                </TextField>
              </Form>
            </TabPanel>
            <TabPanel id="csv">
              <CsvInvite
                onSuccess={close}
                onError={(error) =>
                  toast.apiError({
                    error: error as ApiError,
                    t,
                    tExists,
                    baseTranslationKey: 'api',
                  })
                }
              />
            </TabPanel>
          </Tabs>
        </DrawerBody>
        {tab === 'single' && (
          <DrawerFooter>
            <Button variant="secondary" onPress={close}>
              {t('actions.cancel')}
            </Button>
            <Button variant="primary" onPress={onSubmit} isPending={isPending} isDisabled={!canSubmit}>
              {t('actions.invite')}
            </Button>
          </DrawerFooter>
        )}
      </StandardDrawer>
    </>
  );
}
