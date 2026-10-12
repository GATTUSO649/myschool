# Dual-curriculum admissions and CBE assessments

Applications store the selected `CBE` or `8-4-4` curriculum. Historical records are not assigned a curriculum automatically. Startup migrations add the admission fields and CBE assessment table. Use `database/migration_dual_curriculum_admissions.sql` only in database environments where startup migrations are not run; do not apply it after those columns have already been added.

Before recording CBE assessments, an administrator configures the school's approved learning areas and qualitative performance descriptors in **Settings → CBE assessment configuration**, one value per line. Authorized staff record the assessment title, evidence, and feedback in **Academics → CBE descriptive assessments**. Teacher access is limited to assigned classes.

CBE learners see these descriptive records on their academic page. CBE learners do not receive numeric scores or 8-4-4 transcript grades through the legacy results workflow. The school is responsible for supplying and maintaining its approved learning-area and descriptor configuration; the portal does not define official CBE grading boundaries.
