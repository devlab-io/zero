CREATE TABLE "mail0_mail_agent_device" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"token_hash" text,
	"enrollment_code_hash" text,
	"enrollment_expires_at" timestamp,
	"last_seen_at" timestamp,
	"revoked_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mail0_mail_draft_revision_job" (
	"id" text PRIMARY KEY NOT NULL,
	"draft_outbox_id" text NOT NULL,
	"kind" text NOT NULL,
	"instruction" text NOT NULL,
	"base_revision" integer NOT NULL,
	"base_digest" text NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"idempotency_key" text NOT NULL,
	"claimed_by_device_id" text,
	"claim_token_hash" text,
	"lease_expires_at" timestamp,
	"result_revision" integer,
	"error" text,
	"completed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "mail0_mail_draft_revision_job_idempotency_unique" UNIQUE("idempotency_key")
);
--> statement-breakpoint
CREATE TABLE "mail0_mail_triage_run" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"connection_id" text NOT NULL,
	"status" text DEFAULT 'running' NOT NULL,
	"lookback_days" integer DEFAULT 30 NOT NULL,
	"max_results" integer DEFAULT 30 NOT NULL,
	"next_page_token" text,
	"scanned_count" integer DEFAULT 0 NOT NULL,
	"reply_needed_count" integer DEFAULT 0 NOT NULL,
	"no_reply_needed_count" integer DEFAULT 0 NOT NULL,
	"error" text,
	"completed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "mail0_draft_outbox" ADD COLUMN "triage_run_id" text;--> statement-breakpoint
ALTER TABLE "mail0_draft_outbox" ADD COLUMN "to" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "mail0_draft_outbox" ADD COLUMN "cc" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "mail0_draft_outbox" ADD COLUMN "bcc" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "mail0_draft_outbox" ADD COLUMN "source_attachments" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "mail0_draft_outbox" ADD COLUMN "classification" text DEFAULT 'reply_needed' NOT NULL;--> statement-breakpoint
ALTER TABLE "mail0_draft_outbox" ADD COLUMN "classification_reason" text;--> statement-breakpoint
ALTER TABLE "mail0_draft_outbox" ADD COLUMN "generation_mode" text DEFAULT 'server' NOT NULL;--> statement-breakpoint
ALTER TABLE "mail0_draft_outbox" ADD COLUMN "review_state" text DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE "mail0_draft_outbox" ADD COLUMN "content_revision" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "mail0_draft_outbox" ADD COLUMN "content_digest" text DEFAULT '' NOT NULL;--> statement-breakpoint
UPDATE "mail0_draft_outbox"
SET "review_state" = CASE
	WHEN "status" IN ('draft_ready', 'approved', 'sending', 'sent') THEN 'ready'
	WHEN "status" = 'failed' THEN 'failed'
	ELSE 'pending'
END;--> statement-breakpoint
ALTER TABLE "mail0_mail_agent_device" ADD CONSTRAINT "mail0_mail_agent_device_user_id_mail0_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."mail0_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mail0_mail_draft_revision_job" ADD CONSTRAINT "mail0_mail_draft_revision_job_draft_outbox_id_mail0_draft_outbox_id_fk" FOREIGN KEY ("draft_outbox_id") REFERENCES "public"."mail0_draft_outbox"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mail0_mail_draft_revision_job" ADD CONSTRAINT "mail0_mail_draft_revision_job_claimed_by_device_id_mail0_mail_agent_device_id_fk" FOREIGN KEY ("claimed_by_device_id") REFERENCES "public"."mail0_mail_agent_device"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mail0_mail_triage_run" ADD CONSTRAINT "mail0_mail_triage_run_user_id_mail0_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."mail0_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mail0_mail_triage_run" ADD CONSTRAINT "mail0_mail_triage_run_connection_id_mail0_connection_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."mail0_connection"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "mail_agent_device_user_id_idx" ON "mail0_mail_agent_device" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "mail_agent_device_last_seen_idx" ON "mail0_mail_agent_device" USING btree ("last_seen_at");--> statement-breakpoint
CREATE INDEX "mail_draft_revision_job_outbox_idx" ON "mail0_mail_draft_revision_job" USING btree ("draft_outbox_id","created_at");--> statement-breakpoint
CREATE INDEX "mail_draft_revision_job_status_idx" ON "mail0_mail_draft_revision_job" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "mail_draft_revision_job_lease_idx" ON "mail0_mail_draft_revision_job" USING btree ("lease_expires_at");--> statement-breakpoint
CREATE INDEX "mail_triage_run_user_created_idx" ON "mail0_mail_triage_run" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "mail_triage_run_connection_status_idx" ON "mail0_mail_triage_run" USING btree ("connection_id","status");--> statement-breakpoint
ALTER TABLE "mail0_draft_outbox" ADD CONSTRAINT "mail0_draft_outbox_triage_run_id_mail0_mail_triage_run_id_fk" FOREIGN KEY ("triage_run_id") REFERENCES "public"."mail0_mail_triage_run"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "draft_outbox_triage_run_idx" ON "mail0_draft_outbox" USING btree ("triage_run_id");--> statement-breakpoint
CREATE INDEX "draft_outbox_review_state_idx" ON "mail0_draft_outbox" USING btree ("connection_id","review_state");
