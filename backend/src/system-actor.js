const SYSTEM_ACTOR_EMAIL = "sistema@crm.internal";
const SYSTEM_ACTOR_NAME = "Sistema";
const SYSTEM_ACTOR_PASSWORD_HASH = "$system-disabled$";

function isSystemActor(user) {
  return String(user?.email || "").trim().toLowerCase() === SYSTEM_ACTOR_EMAIL;
}

function systemActorData(empresaId) {
  return {
    empresaId,
    nome: SYSTEM_ACTOR_NAME,
    email: SYSTEM_ACTOR_EMAIL,
    senhaHash: SYSTEM_ACTOR_PASSWORD_HASH,
    papel: "ADMIN",
    ativo: false,
  };
}

module.exports = {
  SYSTEM_ACTOR_EMAIL,
  SYSTEM_ACTOR_NAME,
  SYSTEM_ACTOR_PASSWORD_HASH,
  isSystemActor,
  systemActorData,
};
