import { Params } from './usePeopleMutations.contracts';
import { PeopleMutations } from './usePeopleMutations.contracts';
import { usePeopleMutationsInputs } from './usePeopleMutationsInputs';
import { usePeopleMutationsRevokeIntroductionToasts } from './usePeopleMutationsRevokeIntroductionToasts';
import { usePeopleMutationsOutput } from './usePeopleMutationsOutput';

export function usePeopleMutations({ target, t }: Params): PeopleMutations {
  const usePeopleMutationsInputsModel = usePeopleMutationsInputs({ target, t });
  const usePeopleMutationsRevokeIntroductionToastsModel =
    usePeopleMutationsRevokeIntroductionToasts(usePeopleMutationsInputsModel);
  return usePeopleMutationsOutput(usePeopleMutationsRevokeIntroductionToastsModel);
}

export { type PeopleMutations } from './usePeopleMutations.contracts';
