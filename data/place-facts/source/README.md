# Pre-P05 county place-facts source pack

This source pack exists to improve place context before P05 without prematurely counting these contextual facts toward the P05 breadth gate.

## Education — 2023

Source: Government of Kenya, *Report of the Presidential Working Party on Education Reform* (2023), Appendix 4.5 (public primary schools/staff) and Appendix 4.6 (public secondary schools/staff). The appendix tables identify TSC 2023 as the source.

Primary source: https://www.education.go.ke/sites/default/files/2023-08/B5%20REPORT%20OF%20THE%20PRESIDENTIAL%20WORKING%20PARTY%20ON%20EDUCATION%20REFORM%207th%20JULY%202023%20.pdf

The counts are **public-school establishments and teacher establishments only**. They are not counts of all public/private schools or every education worker. Validation totals retained from the source tables: 23,274 public primary schools; 183,929 primary classroom teachers; 9,246 public secondary schools; 108,569 secondary teachers.

## Health facilities — 2023

The generated place-facts product joins the existing P04 Ministry of Health facility-census package at `data/p04/health-facility-census-2023.json`. It uses the report's **total facilities assessed** county column, not a live KMHFR/NHFR count and not a hospital count.

Primary source: https://www.health.go.ke/sites/default/files/2024-01/Kenya%20Health%20Facility%20Census%20Report%20September%202023.pdf

## Hospitals — historical 2017 infrastructure baseline

Source: Ministry of Health, *Health Infrastructure Norms and Standards 2017*, Annex 3 — Existing health facilities per county and gaps.

Primary source: https://api.kmhfr.health.go.ke/media/Health_Infrastructure_Norms_and_Standards_2017.pdf

For this pack, **hospital** means the Annex 3 actual count of Level 4 primary-referral facilities plus Level 5 secondary-referral facilities. The source grand totals reconcile to 349 Level 4 and 13 Level 5 facilities (362 combined). This is a historical infrastructure baseline, not a current 2026 hospital register.

## Doctors — historical approximate baseline only

Source: KIPPRA, *Kenya Economic Report 2013*, Table 5.8, citing Commission on Revenue Allocation (CRA), 2011.

Primary source: https://kippra.or.ke/wp-content/uploads/2021/02/ker2013.pdf

The report explicitly labels these as **approximate** doctor counts, computed by dividing population by the reported population-per-doctor ratio. They are therefore shown only as a clearly dated historical baseline. Lamu is left unavailable rather than inferred.

## Geography and inheritance rule

County facts are never copied to constituencies or wards. Ward/constituency context may show only facts directly published for that geography or clearly labelled boundary-derived measures such as area. A missing small-area fact remains missing.
