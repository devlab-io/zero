CREATE TABLE "mail0_integration_webhook_delivery" (
	"id" text PRIMARY KEY NOT NULL,
	"provider" text DEFAULT 'linear' NOT NULL,
	"delivery_id" text NOT NULL,
	"event_type" text DEFAULT '' NOT NULL,
	"received_at" timestamp DEFAULT now() NOT NULL,
	"processed_at" timestamp,
	"outcome" text DEFAULT 'received' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mail0_team_external_link" (
	"id" text PRIMARY KEY NOT NULL,
	"team_thread_id" text NOT NULL,
	"kind" text DEFAULT 'other' NOT NULL,
	"label" text NOT NULL,
	"url" text NOT NULL,
	"created_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"removed_at" timestamp,
	"removed_by" text
);
--> statement-breakpoint
CREATE TABLE "mail0_team_integration_install" (
	"id" text PRIMARY KEY NOT NULL,
	"team_id" text NOT NULL,
	"provider" text DEFAULT 'linear' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"workspace_id" text,
	"workspace_name" text,
	"scopes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"oauth_state" text,
	"state_expires_at" timestamp,
	"pkce_verifier_envelope" jsonb,
	"access_token_envelope" jsonb,
	"refresh_token_envelope" jsonb,
	"access_token_expires_at" timestamp,
	"installed_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"revoked_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "mail0_team_integration_mapping" (
	"id" text PRIMARY KEY NOT NULL,
	"install_id" text NOT NULL,
	"kind" text NOT NULL,
	"reta_value" text NOT NULL,
	"external_id" text NOT NULL,
	"external_label" text DEFAULT '' NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mail0_team_issue_create_request" (
	"id" text PRIMARY KEY NOT NULL,
	"install_id" text NOT NULL,
	"team_thread_id" text NOT NULL,
	"requested_by" text NOT NULL,
	"client_request_key" text NOT NULL,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"linear_team_id" text NOT NULL,
	"state_id" text,
	"assignee_external_id" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"preview_digest" text,
	"preview_expires_at" timestamp,
	"lease_expires_at" timestamp,
	"issue_id" text,
	"issue_identifier" text,
	"issue_url" text,
	"error" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"resolved_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "mail0_team_outbound_delivery" (
	"id" text PRIMARY KEY NOT NULL,
	"webhook_id" text NOT NULL,
	"event_type" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp DEFAULT now() NOT NULL,
	"claimed_at" timestamp,
	"last_error" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"delivered_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "mail0_team_outbound_webhook" (
	"id" text PRIMARY KEY NOT NULL,
	"team_id" text NOT NULL,
	"url" text NOT NULL,
	"events" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"secret_envelope" jsonb,
	"active" boolean DEFAULT true NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"disabled_at" timestamp,
	"consecutive_failures" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mail0_team_thread_issue_link" (
	"id" text PRIMARY KEY NOT NULL,
	"team_thread_id" text NOT NULL,
	"install_id" text NOT NULL,
	"issue_id" text NOT NULL,
	"issue_identifier" text DEFAULT '' NOT NULL,
	"issue_url" text DEFAULT '' NOT NULL,
	"created_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"unlinked_at" timestamp,
	"unlinked_by" text
);
--> statement-breakpoint
ALTER TABLE "mail0_team_audit_log" ALTER COLUMN "actor_user_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "mail0_team_audit_log" ADD COLUMN "actor_kind" text DEFAULT 'user' NOT NULL;--> statement-breakpoint
-- Audit append-only : supprimer un compte ne doit JAMAIS effacer l'audit —
-- la FK cascade héritée devient SET NULL.
ALTER TABLE "mail0_team_audit_log" DROP CONSTRAINT "mail0_team_audit_log_actor_user_id_mail0_user_id_fk";--> statement-breakpoint
ALTER TABLE "mail0_team_audit_log" ADD CONSTRAINT "mail0_team_audit_log_actor_user_id_mail0_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."mail0_user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
-- actor_kind borné ; system/integration ⇒ AUCUN acteur humain. (user ⇒
-- non-null est garanti à l'INSERT applicatif : un CHECK bilatéral bloquerait
-- le SET NULL de la suppression de compte.)
ALTER TABLE "mail0_team_audit_log" ADD CONSTRAINT "team_audit_actor_kind_check" CHECK ("actor_kind" IN ('user','system','integration'));--> statement-breakpoint
ALTER TABLE "mail0_team_audit_log" ADD CONSTRAINT "team_audit_nonhuman_null_actor_check" CHECK ("actor_kind" = 'user' OR "actor_user_id" IS NULL);--> statement-breakpoint
ALTER TABLE "mail0_team_issue_create_request" ADD CONSTRAINT "team_issue_create_request_status_check" CHECK ("status" IN ('previewed','pending','created','failed','needs_reconciliation'));--> statement-breakpoint
ALTER TABLE "mail0_team_outbound_delivery" ADD CONSTRAINT "team_outbound_delivery_status_check" CHECK ("status" IN ('pending','sending','delivered','dead'));--> statement-breakpoint
ALTER TABLE "mail0_team_external_link" ADD CONSTRAINT "mail0_team_external_link_team_thread_id_mail0_team_thread_id_fk" FOREIGN KEY ("team_thread_id") REFERENCES "public"."mail0_team_thread"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mail0_team_external_link" ADD CONSTRAINT "mail0_team_external_link_created_by_mail0_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."mail0_user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mail0_team_external_link" ADD CONSTRAINT "mail0_team_external_link_removed_by_mail0_user_id_fk" FOREIGN KEY ("removed_by") REFERENCES "public"."mail0_user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mail0_team_integration_install" ADD CONSTRAINT "mail0_team_integration_install_team_id_mail0_team_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."mail0_team"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mail0_team_integration_install" ADD CONSTRAINT "mail0_team_integration_install_installed_by_mail0_user_id_fk" FOREIGN KEY ("installed_by") REFERENCES "public"."mail0_user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mail0_team_integration_mapping" ADD CONSTRAINT "mail0_team_integration_mapping_install_id_mail0_team_integration_install_id_fk" FOREIGN KEY ("install_id") REFERENCES "public"."mail0_team_integration_install"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mail0_team_integration_mapping" ADD CONSTRAINT "mail0_team_integration_mapping_created_by_mail0_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."mail0_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mail0_team_issue_create_request" ADD CONSTRAINT "mail0_team_issue_create_request_install_id_mail0_team_integration_install_id_fk" FOREIGN KEY ("install_id") REFERENCES "public"."mail0_team_integration_install"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mail0_team_issue_create_request" ADD CONSTRAINT "mail0_team_issue_create_request_team_thread_id_mail0_team_thread_id_fk" FOREIGN KEY ("team_thread_id") REFERENCES "public"."mail0_team_thread"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mail0_team_issue_create_request" ADD CONSTRAINT "mail0_team_issue_create_request_requested_by_mail0_user_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."mail0_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mail0_team_outbound_delivery" ADD CONSTRAINT "mail0_team_outbound_delivery_webhook_id_mail0_team_outbound_webhook_id_fk" FOREIGN KEY ("webhook_id") REFERENCES "public"."mail0_team_outbound_webhook"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mail0_team_outbound_webhook" ADD CONSTRAINT "mail0_team_outbound_webhook_team_id_mail0_team_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."mail0_team"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mail0_team_outbound_webhook" ADD CONSTRAINT "mail0_team_outbound_webhook_created_by_mail0_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."mail0_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mail0_team_thread_issue_link" ADD CONSTRAINT "mail0_team_thread_issue_link_team_thread_id_mail0_team_thread_id_fk" FOREIGN KEY ("team_thread_id") REFERENCES "public"."mail0_team_thread"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mail0_team_thread_issue_link" ADD CONSTRAINT "mail0_team_thread_issue_link_install_id_mail0_team_integration_install_id_fk" FOREIGN KEY ("install_id") REFERENCES "public"."mail0_team_integration_install"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mail0_team_thread_issue_link" ADD CONSTRAINT "mail0_team_thread_issue_link_created_by_mail0_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."mail0_user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mail0_team_thread_issue_link" ADD CONSTRAINT "mail0_team_thread_issue_link_unlinked_by_mail0_user_id_fk" FOREIGN KEY ("unlinked_by") REFERENCES "public"."mail0_user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "integration_webhook_delivery_unique" ON "mail0_integration_webhook_delivery" USING btree ("provider","delivery_id");--> statement-breakpoint
CREATE INDEX "team_external_link_thread_idx" ON "mail0_team_external_link" USING btree ("team_thread_id");--> statement-breakpoint
CREATE UNIQUE INDEX "team_integration_install_team_provider_unique" ON "mail0_team_integration_install" USING btree ("team_id","provider");--> statement-breakpoint
CREATE INDEX "team_integration_install_workspace_idx" ON "mail0_team_integration_install" USING btree ("provider","workspace_id");--> statement-breakpoint
CREATE UNIQUE INDEX "team_integration_mapping_slot_unique" ON "mail0_team_integration_mapping" USING btree ("install_id","kind","reta_value");--> statement-breakpoint
CREATE INDEX "team_integration_mapping_install_idx" ON "mail0_team_integration_mapping" USING btree ("install_id");--> statement-breakpoint
CREATE UNIQUE INDEX "team_issue_create_request_key_unique" ON "mail0_team_issue_create_request" USING btree ("install_id","client_request_key");--> statement-breakpoint
CREATE INDEX "team_issue_create_request_thread_idx" ON "mail0_team_issue_create_request" USING btree ("team_thread_id");--> statement-breakpoint
CREATE INDEX "team_outbound_delivery_due_idx" ON "mail0_team_outbound_delivery" USING btree ("status","next_attempt_at");--> statement-breakpoint
CREATE INDEX "team_outbound_webhook_team_idx" ON "mail0_team_outbound_webhook" USING btree ("team_id");--> statement-breakpoint
CREATE UNIQUE INDEX "team_thread_issue_link_active_unique" ON "mail0_team_thread_issue_link" USING btree ("team_thread_id","issue_id") WHERE "mail0_team_thread_issue_link"."unlinked_at" is null;--> statement-breakpoint
CREATE INDEX "team_thread_issue_link_issue_idx" ON "mail0_team_thread_issue_link" USING btree ("install_id","issue_id");--> statement-breakpoint
CREATE INDEX "team_thread_issue_link_thread_idx" ON "mail0_team_thread_issue_link" USING btree ("team_thread_id");