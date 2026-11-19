-- Lets whoever builds an affiliate invite pick the discount code up front
-- (e.g. ARIA15) instead of getting the name-derived one (ARIAMICHELLE).
-- Signup prefers this over the generated code when set; null keeps today's
-- behaviour. Stored lowercase, matched case-insensitively like affiliate_code.
alter table creator_invites
  add column if not exists requested_affiliate_code text;

comment on column creator_invites.requested_affiliate_code is
  'Admin-chosen affiliate/discount code to issue on acceptance; null = derive from creator name';
