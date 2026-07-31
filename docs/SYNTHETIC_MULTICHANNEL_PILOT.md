# Synthetic Multichannel Pilot

## Purpose

This pilot validates the internal inbound pipeline for WhatsApp, Instagram, and
Messenger without using Meta assets. It runs only against temporary databases,
uses reserved synthetic identities, signs requests with ephemeral in-memory
secrets, and exercises the real webhook and commercial services.

The pilot is not an outbound test. It does not call the Graph API, use a real
token, provision a production channel, or enable a production capability.

## Contract

- Webhook simulators are importable test helpers; no simulator route is mounted.
- Simulators fail closed when `NODE_ENV=production`.
- Local HTTP servers bind to `127.0.0.1` and are closed after the run.
- WhatsApp, Instagram, and Messenger use their own channel type and identity.
- The same opaque sender or event identifier may exist in different channels or
  tenants without merging their commercial records.
- Instagram and Messenger identities remain opaque and do not become telephone
  numbers.
- Only a WhatsApp channel loaded from the database with `modoTeste=true` accepts
  a simulated reply. The resulting message is explicitly marked as simulated
  and not sent.
- Real WhatsApp, Instagram, Messenger, Site, and unknown channels remain
  unavailable to the simulated-reply writer.

## Transport Limits

The webhook body remains limited to 1 MiB. The focal WhatsApp intake accepts at
most three entries, five changes per entry, five events per change, and ten
events per request. A request above any limit is rejected before persistence.

Content-Encoding is accepted only when absent or when exactly one `identity`
value is present. Compressed, duplicated, concatenated, and ambiguous values are
rejected before commercial processing.

## Evidence Matrix

The focal pilot proves, for each channel:

- valid and invalid HMAC behavior;
- durable `EventoWebhook` intake;
- contact, client, lead, conversation, and inbound message creation;
- Inbox and Customer 360 visibility;
- replay and concurrent-delivery deduplication;
- tenant and channel isolation;
- terminal behavior for non-text events;
- timestamps only after the contracted processing stage;
- no Graph API or real outbound call.

Additional WhatsApp lifecycle coverage proves that a pause between intake and
processing blocks completion, and that a delayed failure cannot overwrite a
success already committed.

## Execution

Run the SQLite pilot with the repository's isolated Prisma runner:

```cmd
node scripts\run-isolated-prisma-tests.cjs node-test tests\multichannel-synthetic-pilot.test.js
```

For PostgreSQL, use the documented disposable PostgreSQL flow, then execute only
`tests\multichannel-synthetic-pilot.test.js` and the focal lifecycle test before
restoring the SQLite Prisma Client.

## Cleanup

After execution, close local HTTP servers and Prisma clients, remove the exact
temporary database directories and sidecars, stop disposable PostgreSQL, release
its port, and regenerate the SQLite Prisma Client. The protected `dev.db` and
repository dependency manifests must retain their baseline hashes.

## Remaining External Validation

Only a future controlled Meta pilot can validate real callback subscription,
the exact production envelope delivered by Meta, external permissions, and the
first real inbound event. Those checks do not change the internal isolation,
deduplication, or outbound-safety contract documented here.
