CREATE TABLE "mail0_draft_outbox" (
	"id" text PRIMARY KEY NOT NULL,
	"connection_id" text NOT NULL,
	"thread_id" text,
	"mission" text,
	"status" text DEFAULT 'queued' NOT NULL,
	"gmail_draft_id" text,
	"subject" text NOT NULL,
	"body" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"scheduled_send_at" timestamp,
	"error" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "mail0_draft_outbox_idempotency_key_unique" UNIQUE("idempotency_key")
);
--> statement-breakpoint
ALTER TABLE "mail0_draft_outbox" ADD CONSTRAINT "mail0_draft_outbox_connection_id_mail0_connection_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."mail0_connection"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "draft_outbox_connection_status_idx" ON "mail0_draft_outbox" USING btree ("connection_id","status");--> statement-breakpoint
CREATE INDEX "draft_outbox_scheduled_send_at_idx" ON "mail0_draft_outbox" USING btree ("scheduled_send_at");
