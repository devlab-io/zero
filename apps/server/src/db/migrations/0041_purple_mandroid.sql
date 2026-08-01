CREATE TABLE "mail0_team" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mail0_team_audit_log" (
	"id" text PRIMARY KEY NOT NULL,
	"team_id" text NOT NULL,
	"actor_user_id" text NOT NULL,
	"action" text NOT NULL,
	"subject_type" text NOT NULL,
	"subject_id" text NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mail0_team_comment_reaction" (
	"comment_id" text NOT NULL,
	"user_id" text NOT NULL,
	"emoji" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "mail0_team_comment_reaction_comment_id_user_id_emoji_pk" PRIMARY KEY("comment_id","user_id","emoji")
);
--> statement-breakpoint
CREATE TABLE "mail0_team_invite" (
	"id" text PRIMARY KEY NOT NULL,
	"team_id" text NOT NULL,
	"email" text NOT NULL,
	"role" text DEFAULT 'member' NOT NULL,
	"invited_by" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"responded_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "mail0_team_label" (
	"id" text PRIMARY KEY NOT NULL,
	"team_id" text NOT NULL,
	"name" text NOT NULL,
	"color" text DEFAULT 'default' NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "team_label_team_name_unique" UNIQUE("team_id","name")
);
--> statement-breakpoint
CREATE TABLE "mail0_team_member" (
	"team_id" text NOT NULL,
	"user_id" text NOT NULL,
	"role" text DEFAULT 'member' NOT NULL,
	"prefs" jsonb DEFAULT '{"onComment":true,"onMention":true,"onAssignment":true}'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "mail0_team_member_team_id_user_id_pk" PRIMARY KEY("team_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "mail0_team_notification" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"team_id" text NOT NULL,
	"team_thread_id" text,
	"comment_id" text,
	"kind" text NOT NULL,
	"actor_user_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"read_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "mail0_team_thread" (
	"id" text PRIMARY KEY NOT NULL,
	"team_id" text NOT NULL,
	"thread_id" text NOT NULL,
	"sharer_user_id" text NOT NULL,
	"sharer_connection_id" text NOT NULL,
	"sharer_email" text NOT NULL,
	"provider_id" text NOT NULL,
	"visibility" text DEFAULT 'team' NOT NULL,
	"subject" text NOT NULL,
	"preview" text DEFAULT '' NOT NULL,
	"participants" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"message_count" integer DEFAULT 0 NOT NULL,
	"latest_received_on" text,
	"status" text DEFAULT 'open' NOT NULL,
	"assignee_user_id" text,
	"last_activity_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "team_thread_team_conn_thread_unique" UNIQUE("team_id","sharer_connection_id","thread_id")
);
--> statement-breakpoint
CREATE TABLE "mail0_team_thread_access" (
	"id" text PRIMARY KEY NOT NULL,
	"team_thread_id" text NOT NULL,
	"user_id" text NOT NULL,
	"source" text NOT NULL,
	"granted_by" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"revoked_at" timestamp,
	"revoked_by" text,
	CONSTRAINT "team_thread_access_thread_user_unique" UNIQUE("team_thread_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "mail0_team_thread_comment" (
	"id" text PRIMARY KEY NOT NULL,
	"team_thread_id" text NOT NULL,
	"author_user_id" text NOT NULL,
	"body" text NOT NULL,
	"mentions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"quote" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mail0_team_thread_label" (
	"team_thread_id" text NOT NULL,
	"label_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "mail0_team_thread_label_team_thread_id_label_id_pk" PRIMARY KEY("team_thread_id","label_id")
);
--> statement-breakpoint
CREATE TABLE "mail0_team_thread_presence" (
	"team_thread_id" text NOT NULL,
	"user_id" text NOT NULL,
	"last_seen_at" timestamp DEFAULT now() NOT NULL,
	"typing_until" timestamp,
	CONSTRAINT "mail0_team_thread_presence_team_thread_id_user_id_pk" PRIMARY KEY("team_thread_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "mail0_team" ADD CONSTRAINT "mail0_team_created_by_mail0_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."mail0_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mail0_team_audit_log" ADD CONSTRAINT "mail0_team_audit_log_team_id_mail0_team_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."mail0_team"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mail0_team_audit_log" ADD CONSTRAINT "mail0_team_audit_log_actor_user_id_mail0_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."mail0_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mail0_team_comment_reaction" ADD CONSTRAINT "mail0_team_comment_reaction_comment_id_mail0_team_thread_comment_id_fk" FOREIGN KEY ("comment_id") REFERENCES "public"."mail0_team_thread_comment"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mail0_team_comment_reaction" ADD CONSTRAINT "mail0_team_comment_reaction_user_id_mail0_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."mail0_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mail0_team_invite" ADD CONSTRAINT "mail0_team_invite_team_id_mail0_team_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."mail0_team"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mail0_team_invite" ADD CONSTRAINT "mail0_team_invite_invited_by_mail0_user_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."mail0_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mail0_team_label" ADD CONSTRAINT "mail0_team_label_team_id_mail0_team_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."mail0_team"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mail0_team_label" ADD CONSTRAINT "mail0_team_label_created_by_mail0_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."mail0_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mail0_team_member" ADD CONSTRAINT "mail0_team_member_team_id_mail0_team_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."mail0_team"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mail0_team_member" ADD CONSTRAINT "mail0_team_member_user_id_mail0_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."mail0_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mail0_team_notification" ADD CONSTRAINT "mail0_team_notification_user_id_mail0_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."mail0_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mail0_team_notification" ADD CONSTRAINT "mail0_team_notification_team_id_mail0_team_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."mail0_team"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mail0_team_notification" ADD CONSTRAINT "mail0_team_notification_team_thread_id_mail0_team_thread_id_fk" FOREIGN KEY ("team_thread_id") REFERENCES "public"."mail0_team_thread"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mail0_team_notification" ADD CONSTRAINT "mail0_team_notification_comment_id_mail0_team_thread_comment_id_fk" FOREIGN KEY ("comment_id") REFERENCES "public"."mail0_team_thread_comment"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mail0_team_notification" ADD CONSTRAINT "mail0_team_notification_actor_user_id_mail0_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."mail0_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mail0_team_thread" ADD CONSTRAINT "mail0_team_thread_team_id_mail0_team_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."mail0_team"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mail0_team_thread" ADD CONSTRAINT "mail0_team_thread_sharer_user_id_mail0_user_id_fk" FOREIGN KEY ("sharer_user_id") REFERENCES "public"."mail0_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mail0_team_thread" ADD CONSTRAINT "mail0_team_thread_assignee_user_id_mail0_user_id_fk" FOREIGN KEY ("assignee_user_id") REFERENCES "public"."mail0_user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mail0_team_thread_access" ADD CONSTRAINT "mail0_team_thread_access_team_thread_id_mail0_team_thread_id_fk" FOREIGN KEY ("team_thread_id") REFERENCES "public"."mail0_team_thread"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mail0_team_thread_access" ADD CONSTRAINT "mail0_team_thread_access_user_id_mail0_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."mail0_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mail0_team_thread_access" ADD CONSTRAINT "mail0_team_thread_access_granted_by_mail0_user_id_fk" FOREIGN KEY ("granted_by") REFERENCES "public"."mail0_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mail0_team_thread_comment" ADD CONSTRAINT "mail0_team_thread_comment_team_thread_id_mail0_team_thread_id_fk" FOREIGN KEY ("team_thread_id") REFERENCES "public"."mail0_team_thread"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mail0_team_thread_comment" ADD CONSTRAINT "mail0_team_thread_comment_author_user_id_mail0_user_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."mail0_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mail0_team_thread_label" ADD CONSTRAINT "mail0_team_thread_label_team_thread_id_mail0_team_thread_id_fk" FOREIGN KEY ("team_thread_id") REFERENCES "public"."mail0_team_thread"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mail0_team_thread_label" ADD CONSTRAINT "mail0_team_thread_label_label_id_mail0_team_label_id_fk" FOREIGN KEY ("label_id") REFERENCES "public"."mail0_team_label"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mail0_team_thread_presence" ADD CONSTRAINT "mail0_team_thread_presence_team_thread_id_mail0_team_thread_id_fk" FOREIGN KEY ("team_thread_id") REFERENCES "public"."mail0_team_thread"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mail0_team_thread_presence" ADD CONSTRAINT "mail0_team_thread_presence_user_id_mail0_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."mail0_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "team_created_by_idx" ON "mail0_team" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "team_audit_team_created_idx" ON "mail0_team_audit_log" USING btree ("team_id","created_at");--> statement-breakpoint
CREATE INDEX "team_invite_team_id_idx" ON "mail0_team_invite" USING btree ("team_id");--> statement-breakpoint
CREATE INDEX "team_invite_email_status_idx" ON "mail0_team_invite" USING btree ("email","status");--> statement-breakpoint
CREATE INDEX "team_label_team_idx" ON "mail0_team_label" USING btree ("team_id");--> statement-breakpoint
CREATE INDEX "team_member_user_id_idx" ON "mail0_team_member" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "team_notification_user_read_idx" ON "mail0_team_notification" USING btree ("user_id","read_at");--> statement-breakpoint
CREATE INDEX "team_notification_user_created_idx" ON "mail0_team_notification" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "team_thread_team_activity_idx" ON "mail0_team_thread" USING btree ("team_id","last_activity_at");--> statement-breakpoint
CREATE INDEX "team_thread_team_status_idx" ON "mail0_team_thread" USING btree ("team_id","status");--> statement-breakpoint
CREATE INDEX "team_thread_assignee_idx" ON "mail0_team_thread" USING btree ("assignee_user_id");--> statement-breakpoint
CREATE INDEX "team_thread_thread_id_idx" ON "mail0_team_thread" USING btree ("thread_id");--> statement-breakpoint
CREATE INDEX "team_thread_access_user_idx" ON "mail0_team_thread_access" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "team_thread_comment_thread_created_idx" ON "mail0_team_thread_comment" USING btree ("team_thread_id","created_at");--> statement-breakpoint
CREATE INDEX "team_thread_comment_author_idx" ON "mail0_team_thread_comment" USING btree ("author_user_id");--> statement-breakpoint
CREATE INDEX "team_thread_label_label_idx" ON "mail0_team_thread_label" USING btree ("label_id");