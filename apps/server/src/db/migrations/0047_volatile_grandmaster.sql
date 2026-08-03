CREATE TABLE "mail0_team_retention_policy" (
	"team_id" text PRIMARY KEY NOT NULL,
	"audit_days" integer,
	"rule_run_days" integer,
	"notification_days" integer,
	"updated_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "team_retention_audit_days_bounds" CHECK ("mail0_team_retention_policy"."audit_days" is null or ("mail0_team_retention_policy"."audit_days" >= 30 and "mail0_team_retention_policy"."audit_days" <= 730)),
	CONSTRAINT "team_retention_rule_run_days_bounds" CHECK ("mail0_team_retention_policy"."rule_run_days" is null or ("mail0_team_retention_policy"."rule_run_days" >= 30 and "mail0_team_retention_policy"."rule_run_days" <= 730)),
	CONSTRAINT "team_retention_notification_days_bounds" CHECK ("mail0_team_retention_policy"."notification_days" is null or ("mail0_team_retention_policy"."notification_days" >= 30 and "mail0_team_retention_policy"."notification_days" <= 730))
);
--> statement-breakpoint
ALTER TABLE "mail0_team_retention_policy" ADD CONSTRAINT "mail0_team_retention_policy_team_id_mail0_team_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."mail0_team"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mail0_team_retention_policy" ADD CONSTRAINT "mail0_team_retention_policy_updated_by_mail0_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."mail0_user"("id") ON DELETE set null ON UPDATE no action;