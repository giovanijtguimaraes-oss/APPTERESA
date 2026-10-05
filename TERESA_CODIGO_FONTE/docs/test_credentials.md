# Test credentials — T.E.R.E.S.A. app

The app starts empty; there are no seeded users. To test, register a new
account via `POST /api/auth/register` or via the Register screen.

## Three roles are now supported
- `doctor` — médico, pode criar e gerenciar pacientes
- `patient_monitored` — paciente que usa o equipamento TERESA01 (BLE)
- `patient_autonomous` — paciente que usa só a análise fotográfica

## Example doctor account used by manual smoke test
- **Email:** doc.teste@teste.com
- **Password:** senha123
- **Role:** doctor
- **Name:** Dra. Teste

Create it with:
```
POST /api/auth/register
{"email":"doc.teste@teste.com","password":"senha123","name":"Dra. Teste","role":"doctor"}
```

## Doctor-created patients (recommended flow)
Doctor logs in and uses **Profile → Meus pacientes → +** to create patients.
This endpoint automatically links the new patient to the current doctor:
```
POST /api/doctor/patients   (Bearer <doctor_token>)
{"email":"pm@teste.com","password":"senha123","name":"Paciente Mon","role":"patient_monitored"}
{"email":"pa@teste.com","password":"senha123","name":"Paciente Aut","role":"patient_autonomous"}
```

Testing agent may also register patients directly via `/api/auth/register`
if an unlinked account is desired. Legacy rows with `role="patient"` are
auto-migrated to `patient_monitored` at backend startup.
