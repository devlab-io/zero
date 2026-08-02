CREATE TABLE "mail0_team_member_absence" (
	"id" text PRIMARY KEY NOT NULL,
	"team_id" text NOT NULL,
	"user_id" text NOT NULL,
	"starts_at" timestamp NOT NULL,
	"ends_at" timestamp NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mail0_team_sla_policy" (
	"team_id" text PRIMARY KEY NOT NULL,
	"first_response_minutes" integer,
	"resolution_minutes" integer,
	"time_zone" text DEFAULT 'UTC' NOT NULL,
	"business_hours" jsonb DEFAULT '{"days":[1,2,3,4,5],"start":"08:00","end":"17:00"}'::jsonb NOT NULL,
	"updated_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "mail0_team_member_absence" ADD CONSTRAINT "mail0_team_member_absence_team_id_mail0_team_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."mail0_team"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mail0_team_member_absence" ADD CONSTRAINT "mail0_team_member_absence_user_id_mail0_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."mail0_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mail0_team_member_absence" ADD CONSTRAINT "mail0_team_member_absence_created_by_mail0_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."mail0_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mail0_team_sla_policy" ADD CONSTRAINT "mail0_team_sla_policy_team_id_mail0_team_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."mail0_team"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mail0_team_sla_policy" ADD CONSTRAINT "mail0_team_sla_policy_updated_by_mail0_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."mail0_user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "team_member_absence_team_ends_idx" ON "mail0_team_member_absence" USING btree ("team_id","ends_at");--> statement-breakpoint
CREATE INDEX "team_member_absence_user_idx" ON "mail0_team_member_absence" USING btree ("user_id");