
export type Binary = Buffer;

export type SerializedValue = {
  n?: number,
  b?: boolean,
  s?: string,
  v?: 'null' | 'undefined' | 'NaN' | 'Infinity' | '-Infinity' | '-0',
  d?: string,
  u?: string,
  bi?: string,
  ta?: {
    b: Binary,
    k: 'i8' | 'ui8' | 'ui8c' | 'i16' | 'ui16' | 'i32' | 'ui32' | 'f32' | 'f64' | 'bi64' | 'bui64',
  },
  e?: {
    m: string,
    n: string,
    s: string,
  },
  r?: {
    p: string,
    f: string,
  },
  a?: SerializedValue[],
  o?: {
    k: string,
    v: SerializedValue,
  }[],
  h?: number,
  id?: number,
  ref?: number,
};

