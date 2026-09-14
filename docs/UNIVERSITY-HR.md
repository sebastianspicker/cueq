# University HR model

cueq was designed around workforce processes at a German university. Its
reference policies, North Rhine-Westphalia holiday calendar, terminology, and
governance roles reflect that origin. Another organization can adapt the
workflows, but must review those assumptions before using them.

A person is the identity used to sign in. Employment is represented separately
as one or more appointments, each with its own organization, schedule, policy,
calendar, and supervisor terms. HR data is protected by explicit capability
grants; an application role such as employee, team lead, or administrator does
not by itself grant access to personnel records.

## Appointments and time accounts

The appointment selector applies to the current browser tab. Changing it clears
appointment-scoped data so that an older response is not shown in the new
context. Commands normally include an appointment ID. The API infers one only
when exactly one eligible appointment covers the requested interval; callers
must split an interval that crosses incompatible terms.

Effective terms record the appointment's organization, supervisor, work
schedule, employment group, holiday calendar, and policy references. New terms
must be configured explicitly. The migration from the older person-only model
creates one identifiable legacy appointment per person and leaves unknown dates
unknown. It does not rewrite past audit entries or export payloads. Version 2
closing exports include appointment identifiers.

Balances and approvals belong to an appointment. Rest and overlap checks still
consider every appointment held by the same person. Roster coverage counts
distinct people, including eligible people without an assigned shift.

HR staff and administrators prepare time accounts from an open closing period.
Preparation creates missing segments at effective-term boundaries and
recalculates compatible segments while preserving approved overtime. The
dashboard reads the latest stored account and its period; opening the dashboard
does not recalculate anything. Run preparation again after attendance changes
and before closing review.

Recorded hours come from completed `WORK` and `DEPLOYMENT` bookings. Target
hours come from the appointment's schedule and holiday calendar. Historical
closing periods retain their UTC calendar representation and inclusive end
marker; the dashboard's daily target uses the Berlin calendar day. Missing
schedule or term coverage prevents preparation, closing, and export for the
affected appointment population.

An existing time-account partition can be replaced through the HR account API.
The request names the person and appointment, supplies contiguous replacement
intervals with exact hour values, gives a reason, and includes the current
revision timestamp. The replacement must preserve total target, actual,
balance, and approved-overtime hours. The first segment keeps the original
account ID. Pending overtime workflows must be resolved first, and closed
periods must be reopened before changing their accounts.

## Personnel data and source ownership

The personnel workspace shows a directory, organization structure, appointment
history, and profile fields with provenance. Employees can submit
revision-checked profile changes. A different authorized person reviews the
request.

For a cueq-owned field, approval updates the profile and any related identity
record in one transaction. A change to an externally owned field waits for the
source system: the outbound queue records the request, a matching import applies
and acknowledges it, and a different imported value becomes a visible conflict.

Each registered source has a fixed ownership profile. JSON and CSV
reconciliation check the source identity and row revisions, then apply the
batch atomically. They cannot overwrite cueq-owned fields. The legacy bulk
importer creates missing legacy appointments, but refuses changes that would
reinterpret dated terms; use the employment configuration API for those.

## Projects and recorded effort

Projects may have subprojects, cost-centre and funding references, managers,
appointment-based memberships, and optional hour budgets. An employee can
allocate an ended work booking from the selected appointment. Membership must
cover the booking interval, and allocations across projects cannot exceed the
booking's whole-minute duration. Allocation does not add attendance credit.

Unallocated work remains visible. Releasing an allocation records zero minutes
and keeps the record and audit history. Release allocations before correcting
the source booking's interval or category. Archived projects reject new effort
but keep historical reads and reports. A self-service capability may preserve
access to project history after membership ends; it does not waive the
membership check for new allocations.

Project summaries and CSV exports hide groups smaller than the configured
minimum of five distinct people. Multiple appointments for one person do not
increase that count. A time-type category cannot be reclassified after it is
created; create another type when its meaning changes.

## Onboarding, offboarding, and the inbox

Lifecycle administrators create versioned onboarding and offboarding
templates. A template contains up to 100 tasks assigned to named people, the
subject employee, or responsible groups. Tasks can have due-date offsets and
dependencies. Activation checks the dependency graph and freezes that version.
Each lifecycle instance snapshots the template and its task definitions, and a
repeated activation event reuses the same instance.

Completing or reopening a task records the actor, reason, and time. A blocked
task cannot be completed, and a prerequisite cannot be reopened after a
dependent task is complete. Task history is append-only. Task capabilities and
current responsibility decide what appears in a person's task inbox; lifecycle
managers can administer the instances within their scope.

Automation responds to appointment start, appointment end, and explicit date
events. Rules use bounded offsets and allowlisted employment-group or source
conditions. They create template tasks and generic in-app notifications. They
cannot execute scripts or SQL, provision accounts, make employment decisions,
or send email. Retries use stable event and notification keys.

## Private documents

The document workspace provides metadata, version history, authorized
downloads, and acknowledgements for a specific version. Metadata and file
content use the same access checks. An acknowledgement records receipt; it is
not a signature.

Uploads are limited to 10 MiB and to PDF, PNG, and JPEG files whose signatures
match their declared type. Encrypted objects live outside public assets. The
deployment supplies the private storage directory and encryption key ring; the
repository contains no built-in encryption keys. Durable staging records allow
recovery to distinguish an abandoned object from a committed version after an
interrupted upload.

Expiry reminders appear only in the authorization-filtered inbox. A retention
date does not automatically delete the document. Configuration and recovery are
described in [Configuration](CONFIGURATION.md) and
[Operations](OPERATIONS.md#recover-private-document-uploads).

## Provenance and limits

The scope also draws on Personio's public descriptions of
[digital personnel files and employee self-service](https://www.personio.de/funktionen/digitale-personalakte/),
[additional reporting relationships](https://support.personio.de/hc/en-us/articles/23599397956893-Summary-of-supervisors-and-employee-relationships),
[project time tracking](https://support.personio.de/hc/en-us/articles/360001981757-Set-up-project-based-time-tracking),
and [onboarding and offboarding templates](https://support.personio.de/hc/en-us/articles/115002529589-Create-onboarding-and-offboarding-workflows).
These references informed the feature set. They do not create a runtime
dependency or define an integration contract.

The repository's tests cover local rules and contracts. An adopting university
must still approve its policies and source ownership, configure providers, and
test migrations, concurrent workers, restoration, and browser journeys with
synthetic data in its target environment. Recruiting, performance scoring,
monetary payroll, location tracking, signing-provider integration, and provider
certification are outside this HR model.
