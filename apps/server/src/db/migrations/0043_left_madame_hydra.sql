CREATE TABLE "mail0_team_rule" (
	"id" text PRIMARY KEY NOT NULL,
	"team_id" text NOT NULL,
	"name" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"connection_id" text NOT NULL,
	"created_by" text NOT NULL,
	"triggers" jsonb NOT NULL,
	"actions" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "mail0_team_rule_run" (
	"id" text PRIMARY KEY NOT NULL,
	"rule_id" text NOT NULL,
	"team_id" text NOT NULL,
	"thread_id" text NOT NULL,
	"team_thread_id" text,
	"outcome" text NOT NULL,
	"reason" text DEFAULT '' NOT NULL,
	"actions_applied" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"actor_user_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"undone_at" timestamp,
	"undone_by" text
);
--> statement-breakpoint
ALTER TABLE "mail0_team_rule" ADD CONSTRAINT "mail0_team_rule_team_id_mail0_team_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."mail0_team"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mail0_team_rule" ADD CONSTRAINT "mail0_team_rule_connection_id_mail0_connection_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."mail0_connection"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mail0_team_rule" ADD CONSTRAINT "mail0_team_rule_created_by_mail0_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."mail0_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mail0_team_rule_run" ADD CONSTRAINT "mail0_team_rule_run_rule_id_mail0_team_rule_id_fk" FOREIGN KEY ("rule_id") REFERENCES "public"."mail0_team_rule"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mail0_team_rule_run" ADD CONSTRAINT "mail0_team_rule_run_team_id_mail0_team_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."mail0_team"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mail0_team_rule_run" ADD CONSTRAINT "mail0_team_rule_run_actor_user_id_mail0_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."mail0_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mail0_team_rule_run" ADD CONSTRAINT "mail0_team_rule_run_undone_by_mail0_user_id_fk" FOREIGN KEY ("undone_by") REFERENCES "public"."mail0_user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "team_rule_team_idx" ON "mail0_team_rule" USING btree ("team_id");--> statement-breakpoint
CREATE INDEX "team_rule_connection_enabled_idx" ON "mail0_team_rule" USING btree ("connection_id","enabled");--> statement-breakpoint
CREATE UNIQUE INDEX "team_rule_run_rule_thread_idx" ON "mail0_team_rule_run" USING btree ("rule_id","thread_id");--> statement-breakpoint
CREATE INDEX "team_rule_run_team_created_idx" ON "mail0_team_rule_run" USING btree ("team_id","created_at");