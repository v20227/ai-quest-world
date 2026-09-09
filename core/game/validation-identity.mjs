export function validationIdentity(event) {
  return JSON.stringify([event.attributes.kind, event.attributes.target ?? null]);
}
