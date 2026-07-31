CREATE TABLE "mail0_send_job" (
	"id" text PRIMARY KEY NOT NULL,
	"connection_id" text NOT NULL,
	"client_submission_key" text NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"payload" jsonb,
	"thread_id" text,
	"scheduled_send_at" timestamp,
	"enqueued_at" timestamp,
	"attempts" integer DEFAULT 0 NOT NULL,
	"error" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "mail0_send_job_connection_submission_unique" UNIQUE("connection_id","client_submission_key")
);
--> statement-breakpoint
ALTER TABLE "mail0_send_job" ADD CONSTRAINT "mail0_send_job_connection_id_mail0_connection_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."mail0_connection"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "send_job_connection_status_idx" ON "mail0_send_job" USING btree ("connection_id","status");--> statement-breakpoint
CREATE INDEX "send_job_status_scheduled_idx" ON "mail0_send_job" USING btree ("status","scheduled_send_at");