import { parse, ParseResult } from '.';

describe('parse', () => {
  type Test = {
    bytes: Buffer;
    expected: ParseResult;
  };

  const tests: Test[] = [{
    bytes: new Buffer([
      128, // Message Type (Caller ID)
      34,  // Message Length

      17,  // Call Type Parameter
      1,   // Parameter length
      1,   // Call type = 1 (Voice Call)

      1,   // Date & Time Parameter
      8,   // Parameter length = 8
      49,  // 1
      48,  // 0 (Month = 10)
      49,  // 1
      48,  // 0 (Day = 10)
      48,  // 0
      51,  // 3 (Hour = 3)
      51,  // 3
      48,  // 0 (Minutes = 30)

      2,   // Calling Number Parameter
      10,  // Parameter length = 10
      49,  // 1
      50,  // 2
      51,  // 3
      52,  // 4
      53,  // 5
      54,  // 6
      55,  // 7
      56,  // 8
      57,  // 9
      48,  // 0 (Number = 1234567890)

      7,   // Calling Name Parameter
      7,   // Parameter length = 7
      80,  // P
      69,  // E
      84,  // T
      69,  // E
      82,  // R
      32,  // (Space)
      82,  // R

      161  // Checksum
    ]),

    expected: {
      dateTime: {
        month: '10',
        day: '10',
        hour: '03',
        minutes: '30'
      },
      callingLineNumber: '1234567890',
      callingLineName: 'PETER R',
      callType: 'voiceCall'
    }
  }];

  it(`throws an error if message type is not 'Caller ID'`, () => {
    const bytes = new Buffer([
      0x99
    ]);

    expect(() => parse(bytes))
      .toThrow(new TypeError(`Received message type '0x99', only message type '0x80' (Caller ID) is supported`));
  });

  it('parses an array of bytes to structured data', () => {
    tests.forEach(({ bytes, expected }) => {
      expect(parse(bytes)).toEqual(expected);
    });
  });

  it('gracefully handles a Buffer where there are additional bytes after the message', () => {
    tests.forEach(({ bytes, expected }) => {
      const bytesWithTrailing = Buffer.concat([
        bytes,
        new Buffer('ADDITIONAL\nBYTES', 'ascii')
      ]);

      expect(parse(bytesWithTrailing)).toEqual(expected);
    });
  });
});
