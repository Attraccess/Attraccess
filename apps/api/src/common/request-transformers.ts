import { Transform } from 'class-transformer';

export const ToBoolean = () => {
  const toPlain = Transform(
    ({ value }) => {
      return value;
    },
    {
      toPlainOnly: true,
    }
  );

  const toClass = (target: unknown, key: string) => {
    return Transform(
      ({ obj }) => {
        return valueToBoolean(obj[key]);
      },
      {
        toClassOnly: true,
      }
    )(target, key);
  };

  return function (target: unknown, key: string) {
    toPlain(target, key);
    toClass(target, key);
  };
};

export const ToJson = () => {
  const toPlain = Transform(
    ({ value }) => {
      return value;
    },
    {
      toPlainOnly: true,
    },
  );

  const toClass = (target: unknown, key: string) => {
    return Transform(
      ({ obj }) => {
        return valueToJson(obj[key]);
      },
      {
        toClassOnly: true,
      },
    )(target, key);
  };

  return function (target: unknown, key: string) {
    toPlain(target, key);
    toClass(target, key);
  };
};

export const ToNumber = () => {
  const toPlain = Transform(
    ({ value }) => {
      return value;
    },
    {
      toPlainOnly: true,
    },
  );

  const toClass = (target: unknown, key: string) => {
    return Transform(
      ({ obj }) => {
        return valueToNumber(obj[key]);
      },
      {
        toClassOnly: true,
      },
    )(target, key);
  };

  return function (target: unknown, key: string) {
    toPlain(target, key);
    toClass(target, key);
  };
};

export const valueToNumber = (value: unknown): number | null | undefined => {
  if (value === null || value === undefined) {
    return value as null | undefined;
  }

  if (typeof value === 'number') {
    return value;
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed.length === 0 || trimmed.toLowerCase() === 'null') {
      return null;
    }
    const parsed = Number(trimmed);
    return Number.isNaN(parsed) ? undefined : parsed;
  }

  return undefined;
};

export const valueToBoolean = (value: unknown): boolean | undefined => {
  if (value === null || value === undefined) {
    return value as undefined;
  }

  if (typeof value === 'boolean') {
    return value;
  }

  if (['true', 'on', 'yes', '1'].includes((value as string).toLowerCase())) {
    return true;
  }

  if (['false', 'off', 'no', '0'].includes((value as string).toLowerCase())) {
    return false;
  }

  return undefined;
};

export const valueToJson = (value: unknown): unknown => {
  if (value === null || value === undefined) {
    return value;
  }

  if (typeof value !== 'string') {
    return value;
  }

  if (value.trim().length === 0) {
    return value;
  }

  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
};
