import { Injectable, Logger } from '@nestjs/common';
import { ReaderUiHooksService } from '../../../plugin-system/reader-ui/reader-ui-hooks.service';

export interface SessionEndInfo {
  resourceId: number;
  userId: number;
  sessionId: number;
}

/** Runs the advisory session-end hook. The session has always ended already; nothing here can undo it. */
@Injectable()
export class SessionEndNotifier {
  private readonly logger = new Logger(SessionEndNotifier.name);

  constructor(private readonly hooks: ReaderUiHooksService) {}

  /** Reader stop: returns the question to show, if any. Never throws. */
  async ask(info: SessionEndInfo) {
    try {
      return await this.hooks.runSessionEnd({ ...info, origin: 'reader' });
    } catch (error) {
      this.logger.warn(`Session-end hook failed: ${(error as Error).message}`);
      return null;
    }
  }

  /** Web/API stop: nobody can be asked, so the plugin's default applies. */
  async applyDefault(info: SessionEndInfo, origin: 'web' | 'api'): Promise<void> {
    try {
      const asked = await this.hooks.runSessionEnd({ ...info, origin });
      if (asked) await asked.result.choice.onAnswer(asked.result.choice.defaultOnTimeout);
    } catch (error) {
      this.logger.warn(`Session-end default failed: ${(error as Error).message}`);
    }
  }
}
