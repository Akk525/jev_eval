/** Structural JSON Schema document. Validation belongs to later issues. */
export interface JsonSchema {
  readonly [keyword: string]: JsonSchemaValue;
}

export type JsonSchemaValue =
  | string
  | number
  | boolean
  | null
  | JsonSchema
  | readonly JsonSchemaValue[];
