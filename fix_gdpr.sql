ALTER TABLE gdpr_consents ALTER COLUMN "resumeStatus" DROP DEFAULT;
ALTER TABLE gdpr_consents DROP CONSTRAINT IF EXISTS "gdpr_consents_resumeStatus_check";
ALTER TABLE gdpr_consents ALTER COLUMN "resumeStatus" TYPE "public"."enum_gdpr_consents_resumeStatus" USING ("resumeStatus"::"public"."enum_gdpr_consents_resumeStatus");
ALTER TABLE gdpr_consents ALTER COLUMN "resumeStatus" SET DEFAULT 'active'::"public"."enum_gdpr_consents_resumeStatus";
