CREATE TABLE "mail0_team_draft_review" (
	"id" text PRIMARY KEY NOT NULL,
	"team_thread_id" text NOT NULL,
	"draft_id" text NOT NULL,
	"owner_user_id" text NOT NULL,
	"reviewer_user_id" text NOT NULL,
	"state" text DEFAULT 'requested' NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"draft_digest" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mail0_team_draft_suggestion" (
	"id" text PRIMARY KEY NOT NULL,
	"review_id" text NOT NULL,
	"author_user_id" text NOT NULL,
	"body_text" text NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"base_digest" text NOT NULL,
	"applied_at" timestamp,
	"applied_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mail0_team_reply_claim" (
	"id" text PRIMARY KEY NOT NULL,
	"team_thread_id" text NOT NULL,
	"user_id" text NOT NULL,
	"review_id" text,
	"client_submission_key" text NOT NULL,
	"outcome" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"resolved_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "mail0_team_reply_intent" (
	"id" text PRIMARY KEY NOT NULL,
	"team_thread_id" text NOT NULL,
	"user_id" text NOT NULL,
	"provider_thread_id" text NOT NULL,
	"baseline_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp NOT NULL,
	"collision_detected_at" timestamp,
	"override_consumed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "mail0_team_thread_presence" ADD COLUMN "replying_until" timestamp;--> statement-breakpoint
ALTER TABLE "mail0_team_draft_review" ADD CONSTRAINT "mail0_team_draft_review_team_thread_id_mail0_team_thread_id_fk" FOREIGN KEY ("team_thread_id") REFERENCES "public"."mail0_team_thread"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mail0_team_draft_review" ADD CONSTRAINT "mail0_team_draft_review_owner_user_id_mail0_user_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."mail0_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mail0_team_draft_review" ADD CONSTRAINT "mail0_team_draft_review_reviewer_user_id_mail0_user_id_fk" FOREIGN KEY ("reviewer_user_id") REFERENCES "public"."mail0_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mail0_team_draft_suggestion" ADD CONSTRAINT "mail0_team_draft_suggestion_review_id_mail0_team_draft_review_id_fk" FOREIGN KEY ("review_id") REFERENCES "public"."mail0_team_draft_review"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mail0_team_draft_suggestion" ADD CONSTRAINT "mail0_team_draft_suggestion_author_user_id_mail0_user_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."mail0_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mail0_team_draft_suggestion" ADD CONSTRAINT "mail0_team_draft_suggestion_applied_by_mail0_user_id_fk" FOREIGN KEY ("applied_by") REFERENCES "public"."mail0_user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mail0_team_reply_claim" ADD CONSTRAINT "mail0_team_reply_claim_team_thread_id_mail0_team_thread_id_fk" FOREIGN KEY ("team_thread_id") REFERENCES "public"."mail0_team_thread"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mail0_team_reply_claim" ADD CONSTRAINT "mail0_team_reply_claim_user_id_mail0_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."mail0_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "team_draft_review_active_unique" ON "mail0_team_draft_review" USING btree ("team_thread_id","draft_id") WHERE "mail0_team_draft_review"."state" in ('requested', 'changes_requested', 'approved');--> statement-breakpoint
CREATE INDEX "team_draft_review_thread_idx" ON "mail0_team_draft_review" USING btree ("team_thread_id");--> statement-breakpoint
CREATE INDEX "team_draft_suggestion_review_idx" ON "mail0_team_draft_suggestion" USING btree ("review_id","created_at");--> statement-breakpoint
ALTER TABLE "mail0_team_reply_intent" ADD CONSTRAINT "mail0_team_reply_intent_team_thread_id_mail0_team_thread_id_fk" FOREIGN KEY ("team_thread_id") REFERENCES "public"."mail0_team_thread"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mail0_team_reply_intent" ADD CONSTRAINT "mail0_team_reply_intent_user_id_mail0_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."mail0_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "team_reply_intent_thread_user_idx" ON "mail0_team_reply_intent" USING btree ("team_thread_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "team_reply_claim_active_unique" ON "mail0_team_reply_claim" USING btree ("team_thread_id") WHERE "mail0_team_reply_claim"."outcome" = 'active';--> statement-breakpoint
CREATE INDEX "team_reply_claim_thread_created_idx" ON "mail0_team_reply_claim" USING btree ("team_thread_id","created_at");