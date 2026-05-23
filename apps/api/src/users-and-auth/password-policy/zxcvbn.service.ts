// zxcvbn strength evaluator (authoritative server-side) with EN+DE language packs
// FEATURE: Password policy strength scoring backbone

import { Injectable } from '@nestjs/common';
import { zxcvbn, zxcvbnOptions } from '@zxcvbn-ts/core';
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
  constructor() {
    zxcvbnOptions.setOptions({
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
    const result = zxcvbn(password, userInputs);
    const crackTimes = result.crackTimesSeconds;
    return {
      score: result.score,
      guessesLog10: result.guessesLog10,
      crackTimesSeconds: {
        offlineFastHashing1e10PerSecond: Number(crackTimes.offlineFastHashing1e10PerSecond),
        offlineSlowHashing1e4PerSecond: Number(crackTimes.offlineSlowHashing1e4PerSecond),
        onlineNoThrottling10PerSecond: Number(crackTimes.onlineNoThrottling10PerSecond),
        onlineThrottling100PerHour: Number(crackTimes.onlineThrottling100PerHour),
      },
      warning: result.feedback.warning ?? '',
      suggestions: result.feedback.suggestions ?? [],
    };
  }
}
