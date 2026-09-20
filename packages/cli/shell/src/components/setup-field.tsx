import type { SerializedSetupField } from "@tableverse-kit/engine";
import {
  fieldPath,
  humanize,
  type FieldValue,
  type FormValues,
} from "../lib/setup-input.ts";
import { Checkbox } from "./ui/checkbox.tsx";
import { Input } from "./ui/input.tsx";
import { Label } from "./ui/label.tsx";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select.tsx";

interface SetupFieldProps {
  name: string;
  parent: string;
  field: SerializedSetupField;
  values: FormValues;
  onChange: (path: string, value: FieldValue) => void;
}

export function SetupField({
  name,
  parent,
  field,
  values,
  onChange,
}: SetupFieldProps) {
  const path = fieldPath(parent, name);
  const label = humanize(name);
  const value = values[path];

  if (field.kind === "object") {
    return (
      <fieldset className="grid gap-3 rounded-lg border border-line-soft p-4">
        <legend className="px-1 font-heading text-sm font-semibold">
          {label}
        </legend>
        {Object.entries(field.fields).map(([childName, childField]) => (
          <SetupField
            key={childName}
            name={childName}
            parent={path}
            field={childField}
            values={values}
            onChange={onChange}
          />
        ))}
      </fieldset>
    );
  }

  if (field.kind === "boolean") {
    return (
      <label className="flex items-center gap-3 rounded-lg border border-line-soft p-3">
        <Checkbox
          checked={value === true}
          onCheckedChange={(checked) => onChange(path, checked)}
        />
        <span className="font-heading text-sm font-medium">{label}</span>
      </label>
    );
  }

  if ((field.kind === "string" || field.kind === "number") && field.enum) {
    const choices = field.enum.map(String);
    return (
      <div className="grid gap-2">
        <Label>{label}</Label>
        <Select
          value={typeof value === "string" && value !== "" ? value : null}
          onValueChange={(choice) => onChange(path, choice ?? "")}
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder={`Choose ${label.toLowerCase()}`} />
          </SelectTrigger>
          <SelectContent>
            {choices.map((choice) => (
              <SelectItem key={choice} value={choice}>
                {choice}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    );
  }

  const isJson = field.kind === "array" || field.kind === "record";
  const id = `setup-${path}`;
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>
        {label}
        {field.optional ? (
          <span className="font-normal text-muted-foreground">optional</span>
        ) : null}
      </Label>
      <Input
        id={id}
        type={field.kind === "number" ? "number" : "text"}
        min={field.kind === "number" ? field.min : undefined}
        max={field.kind === "number" ? field.max : undefined}
        minLength={field.kind === "string" ? field.min : undefined}
        maxLength={field.kind === "string" ? field.max : undefined}
        required={!field.optional}
        placeholder={
          isJson ? (field.kind === "array" ? "[]" : "{}") : undefined
        }
        className={isJson ? "font-mono" : undefined}
        value={typeof value === "string" ? value : ""}
        onChange={(event) => onChange(path, event.target.value)}
      />
      {isJson ? (
        <p className="text-xs text-muted-foreground">Enter valid JSON.</p>
      ) : null}
    </div>
  );
}
