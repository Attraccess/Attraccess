import { type RegisterFormat } from '../../modbus/model';

export const emptyFormat: RegisterFormat = {
  address: 0,
  addressBase: 0,
  dataType: 'uint16',
  byteOrder: 'big',
  wordOrder: 'big',
  scale: 1,
  offset: 0,
};
