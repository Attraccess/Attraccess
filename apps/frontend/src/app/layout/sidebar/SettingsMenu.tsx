import { Settings, LogOut, User, Languages, Check, Moon, Sun, Monitor } from 'lucide-react';
import {
  Dropdown,
  DropdownTrigger,
  DropdownMenu,
  DropdownItem,
  DropdownPopover,
  Label,
  Description,
} from '@heroui/react';
import { buttonVariants } from '@heroui/styles';
import { useSidebarState } from './HelpfulLinks';
type Props = Pick<
  ReturnType<typeof useSidebarState>,
  | 'isCollapsed'
  | 'user'
  | 'isSettingsMenuOpen'
  | 'handleSettingsMenuOpenChange'
  | 't'
  | 'setLanguage'
  | 'language'
  | 'navigate'
  | 'cycleTheme'
  | 'theme'
  | 'logout'
  | 'logoutEverywhere'
  | 'logoutPending'
  | 'canLogoutEverywhere'
  | 'logoutUnavailableReason'
  | 'logoutEverywhereLabel'
  | 'logoutPendingLabel'
  | 'logoutProviderNotice'
>;
export function SettingsMenu({
  isCollapsed,
  user,
  isSettingsMenuOpen,
  handleSettingsMenuOpenChange,
  t,
  setLanguage,
  language,
  navigate,
  cycleTheme,
  theme,
  logout,
  logoutEverywhere,
  logoutPending,
  canLogoutEverywhere,
  logoutUnavailableReason,
  logoutEverywhereLabel,
  logoutPendingLabel,
  logoutProviderNotice,
}: Props) {
  return (
    <div className={isCollapsed ? 'p-2' : 'p-4'}>
      {user && (
        <div className={`flex items-center ${isCollapsed ? 'justify-center' : 'justify-between'}`}>
          {!isCollapsed && (
            <div className="flex items-center text-sm">
              <User className="h-4 w-4 mr-2" />
              <span>{user.username}</span>
            </div>
          )}
          <Dropdown
            data-cy="sidebar-settings-dropdown"
            isOpen={isSettingsMenuOpen}
            onOpenChange={handleSettingsMenuOpenChange}
          >
            <DropdownTrigger
              // Not "Settings": that name now belongs to the nav entry two rows up. This menu
              // is language, account and logout.
              aria-label={t('userMenu')}
              data-cy="sidebar-settings-button"
              className={`${buttonVariants({ variant: 'ghost', isIconOnly: true })} !inline-flex items-center justify-center`}
            >
              <Settings className="h-5 w-5" />
            </DropdownTrigger>
            <DropdownPopover className="max-w-xs">
              <DropdownMenu data-cy="sidebar-settings-dropdown-menu">
                <DropdownItem key="language-label" id="language-label" isDisabled>
                  <Languages className="h-4 w-4" />
                  {t('language')}
                </DropdownItem>
                <DropdownItem
                  key="language-en"
                  id="language-en"
                  onPress={() => setLanguage('en')}
                  data-cy="sidebar-language-en"
                >
                  {t('languages.en')}
                  {language === 'en' ? <Check className="h-4 w-4" /> : null}
                </DropdownItem>
                <DropdownItem
                  key="language-de"
                  id="language-de"
                  onPress={() => setLanguage('de')}
                  data-cy="sidebar-language-de"
                >
                  {t('languages.de')}
                  {language === 'de' ? <Check className="h-4 w-4" /> : null}
                </DropdownItem>
                <DropdownItem
                  key="account"
                  id="account"
                  onPress={() => navigate('/account')}
                  data-cy="sidebar-account-button"
                >
                  <User className="h-4 w-4" />
                  {t('account')}
                </DropdownItem>
                <DropdownItem key="theme" id="theme" onPress={cycleTheme} data-cy="sidebar-theme-toggle">
                  {theme === 'light' ? (
                    <Sun className="h-4 w-4" />
                  ) : theme === 'dark' ? (
                    <Moon className="h-4 w-4" />
                  ) : (
                    <Monitor className="h-4 w-4" />
                  )}
                  {t('design', { variant: t(`designVariants.${theme}`) })}
                </DropdownItem>
                <DropdownItem
                  key="logout"
                  id="logout"
                  isDisabled={logoutPending}
                  onPress={() => logout()}
                  data-cy="sidebar-logout-button"
                >
                  <LogOut />
                  {logoutPending ? logoutPendingLabel : t('logout')}
                </DropdownItem>
                <DropdownItem
                  key="logout-everywhere"
                  id="logout-everywhere"
                  textValue={logoutEverywhereLabel}
                  isDisabled={logoutPending || !canLogoutEverywhere}
                  onPress={logoutEverywhere}
                  data-cy="sidebar-logout-everywhere-button"
                >
                  <LogOut />
                  <div className="flex min-w-0 flex-col gap-1">
                    <Label>{logoutEverywhereLabel}</Label>
                    <Description>{canLogoutEverywhere ? logoutProviderNotice : logoutUnavailableReason}</Description>
                  </div>
                </DropdownItem>
              </DropdownMenu>
            </DropdownPopover>
          </Dropdown>
        </div>
      )}
    </div>
  );
}
