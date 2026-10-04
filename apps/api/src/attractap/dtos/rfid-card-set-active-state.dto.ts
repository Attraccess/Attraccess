import { IsBoolean } from 'class-validator';
import { ToBoolean } from '../../common/request-transformers';

export class NfcCardSetActiveStateDto {
  @IsBoolean()
  @ToBoolean()
  active!: boolean;
}
