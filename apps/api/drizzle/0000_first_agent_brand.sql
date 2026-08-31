CREATE TABLE "exports" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"kind" text NOT NULL,
	"path" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "floor_models" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"version" integer NOT NULL,
	"model" jsonb NOT NULL,
	"iteration" integer,
	"critique" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"source_path" text NOT NULL,
	"plan_path" text NOT NULL,
	"status" text DEFAULT 'uploaded' NOT NULL,
	"parse_error" text,
	"parse_progress" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tactile_designs" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"floor_model_version" integer NOT NULL,
	"design" jsonb NOT NULL,
	"notes" jsonb NOT NULL,
	"valid" boolean DEFAULT false NOT NULL,
	"violations" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"iterations" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" text DEFAULT 'done' NOT NULL,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "exports" ADD CONSTRAINT "exports_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "floor_models" ADD CONSTRAINT "floor_models_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tactile_designs" ADD CONSTRAINT "tactile_designs_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;