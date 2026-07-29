const ACTION_TYPES = Object.freeze([
  "ASSIGN_OWNER",
  "ASSIGN_ROUND_ROBIN",
  "CREATE_FOLLOW_UP",
  "CREATE_INTERNAL_EVENT",
  "UPDATE_NEXT_FOLLOW_UP_PROJECTION",
]);

const WORKER_ACTION_TYPES = Object.freeze([
  "ASSIGN_OWNER",
  "CREATE_FOLLOW_UP",
  "CREATE_INTERNAL_EVENT",
  "UPDATE_NEXT_FOLLOW_UP_PROJECTION",
]);

const PILOT_ACTION_TYPES = Object.freeze([
  "CREATE_INTERNAL_EVENT",
]);

function unavailableActionTypes(actions, allowedActions = WORKER_ACTION_TYPES) {
  if (!Array.isArray(actions) || actions.length === 0) return ["UNKNOWN"];
  return [...new Set(actions
    .map((action) => action?.tipo)
    .filter((type) => !allowedActions.includes(type)))];
}

module.exports = {
  ACTION_TYPES,
  PILOT_ACTION_TYPES,
  WORKER_ACTION_TYPES,
  unavailableActionTypes,
};
