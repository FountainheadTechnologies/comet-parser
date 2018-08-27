export type ParseResult = Partial<{
  dateTime: {
    month: string;
    day: string;
    hour: string;
    minutes: string;
  };
  callingLineNumber: string;
  reasonForAbsenceOfNumber: 'withheld' | 'unavailable';
  callingLineName: string;
  callType: 'voiceCall' | 'ringBackWhenFree' | 'messageWaiting';
}>;

const toHex = (byte: number): string =>
  `0x${byte.toString(16)}`;

/**
 * Splits a Buffer into its `type`, `length`, `message` and `checksum` fields.
 */
const splitMessage = (bytes: Buffer) => {
  const type = bytes[0];
  const length = bytes[1];
  const message = bytes.slice(2, length + 2);
  const checksum = bytes[2 + length];

  return { type, length, message, checksum };
};

export const parse = (bytes: Buffer): ParseResult => {
  const { type, length, message } = splitMessage(bytes);

  /**
   * Only support message types of 'Caller ID (0x80)'.
   */
  if (type !== 0x80) {
    throw new TypeError(`Received message type '${toHex(type)}', only message type '0x80' (Caller ID) is supported`);
  }

  /**
   * Extract parameter blocks from message, ignoring first two bytes (message
   * type and length) and last bytes (checksum).
   */
  const parameters = extractParameters(message, length);

  return parameters.reduce((result, param) => {
    const alias = findAlias(param.type);
    const parsedValue = parseValue(alias, param.value);

    result[alias] = parsedValue;
    return result;
  }, {} as ParseResult);
};

/**
 * The intermediate description of a Parameter extracted from a Message.
 */
type Parameter = {
  /**
   * The byte value representing this parameter's type. See the Comet developer
   * documentation for a list of available types.
   */
  type: number;

  /**
   * The value of this parameter. Always encoded as a Buffer containing each
   * byte, but the content varies depending on the parameter type.
   */
  value: Buffer;
};

/**
 * Extracts Parameters from a Message and returns an array of Parameter objects
 */
const extractParameters = (message: Buffer, length: number): Parameter[] => {
  const parameters: Parameter[] = [];

  let start = 0;
  while (start < length) {
    const type = message[start];
    const valueLength = message[start + 1];
    const value = message.slice(start + 2, start + 2 + valueLength);

    parameters.push({
      type,
      value
    });

    start += valueLength + 2;
  }

  return parameters;
};

/**
 * Maps parameter type byte vales to string-based aliases, see Comet developer
 * documentation for a list of supported types.
 */
const parameterTypeAliases = [{
  value: 0x01,
  name: 'dateTime'
}, {
  value: 0x02,
  name: 'callingLineNumber'
}, {
  value: 0x04,
  name: 'reasonForAbsenceOfNumber'
}, {
  value: 0x07,
  name: 'callingLineName'
}, {
  value: 0x11,
  name: 'callType'
}];

/**
 * Find the parameter type alias based on its byte value using the table above.
 * If no such mapping exists, throw a runtime error.
 */
const findAlias = (value: number) => {
  const matches = parameterTypeAliases.filter(t => t.value === value);

  if (!matches.length) {
    throw new TypeError(`Parameter type '${toHex(value)}' not recognised`);
  }

  return matches[0].name as keyof ParseResult;
};

/**
 * Parameter type-specific parsers, keyed by their string-based alias. If a
 * parser is not specified, the default parser should be used.
 */
const parsers: { [key: string]: (value: Buffer) => any } = {
  dateTime: value => ({
    month: value.slice(0, 2).toString('ascii'),
    day: value.slice(2, 4).toString('ascii'),
    hour: value.slice(4, 6).toString('ascii'),
    minutes: value.slice(6, 8).toString('ascii')
  }),

  reasonForAbsenceOfNumber: value => {
    if (value[0] === 0x50) {
      return 'withheld';
    }

    if (value[0] === 0x4F) {
      return 'unavailable';
    }

    throw new TypeError(`Reason for absence of number '${toHex(value[0])}' not recognised`);
  },

  callType: value => {
    if (value[0] === 0x01) {
      return 'voiceCall';
    }

    if (value[0] === 0x02) {
      return 'ringBackWhenFree';
    }

    if (value[0] === 0x81) {
      return 'messageWaiting';
    }

    throw new TypeError(`Call type '${toHex(value[0])} not recognised`);
  }
};

/**
 * The default parser simply converts a Buffer to its ASCII representation
 */
const defaultParser = (value: Buffer): string =>
  value.toString('ascii');

/**
 * Attempt to parse a value according to its parameter type alias using the
 * defined parser. If no parser exists, use the default parser.
 */
const parseValue = (type: string, value: Buffer) =>
  parsers[type] ? parsers[type](value) : defaultParser(value);
