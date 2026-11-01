import { Injectable, Logger } from '@nestjs/common';
import type { ReaderUiLanguage } from '../../../plugin-system/reader-ui/host-texts';
import { ReaderUiHooksService } from '../../../plugin-system/reader-ui/reader-ui-hooks.service';
import { SettingsService } from '../../../settings/settings.service';

export interface SessionEndInfo {
  resourceId: number;
  userId: number;
  sessionId: number;
}

/** Runs the advisory session-end hook. The session has always ended already; nothing here can undo it. */
@Injectable()
export class SessionEndNotifier {
  private readonly logger = new Logger(SessionEndNotifier.name);

  constructor(
    private readonly hooks: ReaderUiHooksService,
    private readonly settings: SettingsService,
  ) {}

  /** Reader stop: returns the question to show (in the card session's language), if any. Never throws. */
  async ask(info: SessionEndInfo, language: ReaderUiLanguage) {
    try {
      return await this.hooks.runSessionEnd({ ...info, origin: 'reader', language });
    } catch (error) {
      this.logger.warn(`Session-end hook failed: ${(error as Error).message}`);
      return null;
    }
  }

  /** Web/API stop: nobody can be asked, so the plugin's default applies. Never throws. */
  async applyDefault(info: SessionEndInfo, origin: 'web' | 'api', locale: string | null | undefined): Promise<void> {
    try {
      const language = await this.settings.resolveLanguage(locale);
      const asked = await this.hooks.runSessionEnd({ ...info, origin, language });
      // Host-guarded: bounded by the hook timeout and never rejects.
      if (asked) await asked.result.choice.onAnswer(asked.result.choice.defaultOnTimeout);
    } catch (error) {
      this.logger.warn(`Session-end default failed: ${(error as Error).message}`);
    }
  }
}
