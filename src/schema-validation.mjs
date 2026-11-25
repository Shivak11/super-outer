import { isDeepStrictEqual } from "node:util";

const typeMatches = (value, type) => {
  if (type === "null") return value === null;
  if (type === "array") return Array.isArray(value);
  if (type === "object") {
    return value !== null && typeof value === "object" && !Array.isArray(value);
  }
  if (type === "integer") return Number.isInteger(value);
  if (type === "number") return typeof value === "number" && Number.isFinite(value);
  return typeof value === type;
};

const resolveLocalRef = (root, ref) => {
  if (!ref.startsWith("#/")) {
    throw new Error(`Only local schema references are supported: ${ref}`);
  }
  return ref
    .slice(2)
    .split("/")
    .map((part) => part.replaceAll("~1", "/").replaceAll("~0", "~"))
    .reduce((value, part) => value?.[part], root);
};

export function validateSchema(schema, value, { root = schema, path = "$" } = {}) {
  const errors = [];

  if (schema.$ref) {
    const resolved = resolveLocalRef(root, schema.$ref);
    if (!resolved) return [`${path}: unresolved schema reference ${schema.$ref}`];
    return validateSchema(resolved, value, { root, path });
  }

  if (schema.const !== undefined && !isDeepStrictEqual(value, schema.const)) {
    errors.push(`${path}: expected constant ${JSON.stringify(schema.const)}`);
  }

  if (schema.enum && !schema.enum.some((candidate) => isDeepStrictEqual(value, candidate))) {
    errors.push(`${path}: value is not in the allowed set`);
  }

  if (schema.type) {
    const types = Array.isArray(schema.type) ? schema.type : [schema.type];
    if (!types.some((type) => typeMatches(value, type))) {
      errors.push(`${path}: expected type ${types.join(" or ")}`);
      return errors;
    }
  }

  if (typeof value === "string") {
    if (schema.minLength !== undefined && value.length < schema.minLength) {
      errors.push(`${path}: string is shorter than ${schema.minLength}`);
    }
    if (schema.pattern && !new RegExp(schema.pattern).test(value)) {
      errors.push(`${path}: string does not match ${schema.pattern}`);
    }
    if (schema.format === "date-time" && Number.isNaN(Date.parse(value))) {
      errors.push(`${path}: invalid date-time`);
    }
  }

  if (typeof value === "number") {
    if (schema.minimum !== undefined && value < schema.minimum) {
      errors.push(`${path}: value is below ${schema.minimum}`);
    }
    if (schema.maximum !== undefined && value > schema.maximum) {
      errors.push(`${path}: value is above ${schema.maximum}`);
    }
  }

  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) {
      errors.push(`${path}: needs at least ${schema.minItems} items`);
    }
    if (schema.maxItems !== undefined && value.length > schema.maxItems) {
      errors.push(`${path}: allows at most ${schema.maxItems} items`);
    }
    if (schema.uniqueItems) {
      for (let index = 0; index < value.length; index += 1) {
        if (value.slice(index + 1).some((item) => isDeepStrictEqual(item, value[index]))) {
          errors.push(`${path}: duplicate array item at index ${index}`);
          break;
        }
      }
    }
    if (schema.items) {
      value.forEach((item, index) => {
        errors.push(
          ...validateSchema(schema.items, item, {
            root,
            path: `${path}[${index}]`,
          }),
        );
      });
    }
  }

  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    const keys = Object.keys(value);
    if (schema.minProperties !== undefined && keys.length < schema.minProperties) {
      errors.push(`${path}: needs at least ${schema.minProperties} properties`);
    }
    for (const required of schema.required ?? []) {
      if (!Object.hasOwn(value, required)) {
        errors.push(`${path}: missing required property ${required}`);
      }
    }
    for (const [key, item] of Object.entries(value)) {
      const propertySchema = schema.properties?.[key];
      if (propertySchema) {
        errors.push(
          ...validateSchema(propertySchema, item, {
            root,
            path: `${path}.${key}`,
          }),
        );
      } else if (schema.additionalProperties === false) {
        errors.push(`${path}: unexpected property ${key}`);
      } else if (
        schema.additionalProperties &&
        typeof schema.additionalProperties === "object"
      ) {
        errors.push(
          ...validateSchema(schema.additionalProperties, item, {
            root,
            path: `${path}.${key}`,
          }),
        );
      }
    }
  }

  return errors;
}

export function assertSchema(schema, value, label = "value") {
  const errors = validateSchema(schema, value);
  if (errors.length > 0) {
    throw new Error(`${label} failed schema validation:\n${errors.join("\n")}`);
  }
  return value;
}
