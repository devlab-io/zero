ALTER TABLE "mail0_user_settings" ALTER COLUMN "settings" SET DEFAULT '{"language":"en","timezone":"UTC","dynamicContent":false,"externalImages":true,"customPrompt":"","trustedSenders":[],"isOnboarded":false,"colorTheme":"system","zeroSignature":true,"autoRead":true,"defaultEmailAlias":"","categories":[{"id":"Important","name":"Important","searchValue":"IMPORTANT","order":0,"icon":"Lightning","isDefault":false},{"id":"All Mail","name":"All Mail","searchValue":"","order":1,"icon":"Mail","isDefault":true},{"id":"Unread","name":"Unread","searchValue":"UNREAD","order":5,"icon":"ScanEye","isDefault":false}],"undoSendEnabled":false,"confirmDirectDraftSend":true,"predictiveWritingEnabled":true,"imageCompression":"medium","animations":false,"askRetaModel":"llama-4-scout"}'::jsonb;--> statement-breakpoint
ALTER TABLE "mail0_connection" ADD COLUMN "auth_account_id" text;--> statement-breakpoint
UPDATE "mail0_connection" AS c
SET "auth_account_id" = a."account_id"
FROM "mail0_account" AS a
WHERE a."user_id" = c."user_id"
  AND a."provider_id" = c."provider_id"
  AND (
    SELECT count(*)
    FROM "mail0_account" AS a2
    WHERE a2."user_id" = c."user_id"
      AND a2."provider_id" = c."provider_id"
  ) = 1;--> statement-breakpoint
CREATE INDEX "connection_auth_account_idx" ON "mail0_connection" USING btree ("user_id","provider_id","auth_account_id");
