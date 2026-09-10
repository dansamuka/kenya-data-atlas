# P25 national Pulse closure

`IND-MOBILE-MONEY-VOLUME` is defined as the monthly **number of agent cash-in/cash-out (CICO) transactions** published by the Central Bank of Kenya in its National Payments System Mobile Payments table.

The source publishes CICO volume in millions of transactions and CICO value in KSh billions. The Atlas converts the published volume exactly to transaction count. The monetary-value column is retained only as source context and must never be used as the canonical `IND-MOBILE-MONEY-VOLUME` value.

This series is country-only, descriptive and non-directional. It is not presented as a reconciled total across every mobile-money rail, and it is not rankable. The P25 validator enforces these semantics as well as a single monthly series containing all source observations.
