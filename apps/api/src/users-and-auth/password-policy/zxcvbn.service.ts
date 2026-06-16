// zxcvbn strength evaluator (authoritative server-side) with EN+DE language packs
// FEATURE: Password policy strength scoring backbone

import { Injectable } from '@nestjs/common';
import { ZxcvbnFactory } from '@zxcvbn-ts/core';
import * as zxcvbnCommonPackage from '@zxcvbn-ts/language-common';
import * as zxcvbnEnPackage from '@zxcvbn-ts/language-en';
import * as zxcvbnDePackage from '@zxcvbn-ts/language-de';

export interface ZxcvbnResult {
  score: number;
  guessesLog10: number;
  crackTimesSeconds: {
    offlineFastHashing1e10PerSecond: number;
    offlineSlowHashing1e4PerSecond: number;
    onlineNoThrottling10PerSecond: number;
    onlineThrottling100PerHour: number;
  };
  warning: string;
  suggestions: string[];
}

@Injectable()
export class ZxcvbnService {
  private readonly zxcvbn: ZxcvbnFactory;

  constructor() {
    this.zxcvbn = new ZxcvbnFactory({
      dictionary: {
        ...zxcvbnCommonPackage.dictionary,
        ...zxcvbnEnPackage.dictionary,
        ...zxcvbnDePackage.dictionary,
      },
      graphs: zxcvbnCommonPackage.adjacencyGraphs,
      translations: zxcvbnEnPackage.translations,
    });
  }

  public evaluate(password: string, userInputs: string[] = []): ZxcvbnResult {
    const result = this.zxcvbn.check(password, userInputs);
    const crackTimes = result.crackTimes;
    return {
      score: result.score,
      guessesLog10: result.guessesLog10,
      crackTimesSeconds: {
        offlineFastHashing1e10PerSecond: crackTimes.offlineFastHashingXPerSecond.seconds,
        offlineSlowHashing1e4PerSecond: crackTimes.offlineSlowHashingXPerSecond.seconds,
        onlineNoThrottling10PerSecond: crackTimes.onlineNoThrottlingXPerSecond.seconds,
        onlineThrottling100PerHour: crackTimes.onlineThrottlingXPerHour.seconds,
      },
      warning: result.feedback.warning ?? '',
      suggestions: result.feedback.suggestions ?? [],
    };
  }
}
