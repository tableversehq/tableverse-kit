export interface GameEvent<
  Category extends string = string,
  Type extends string = string,
  Payload = unknown,
> {
  category: Category;
  type: Type;
  payload: Payload;
}
