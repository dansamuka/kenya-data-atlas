#!/usr/bin/env Rscript
suppressPackageStartupMessages(library(jsonlite))

paths <- c(
  Sys.getenv("KPHC_V4_T1_9_RDA","/tmp/V4_T1.9.rda"),
  Sys.getenv("KPHC_V4_T2_2_RDA","/tmp/V4_T2.2.rda"),
  Sys.getenv("KPHC_V4_T2_36_RDA","/tmp/V4_T2.36.rda")
)
for (p in paths) {
  if (!file.exists(p)) stop("Required pinned census table missing: ", p)
  load(p)
}
if (!exists("V4_T1.9") || !exists("V4_T2.2") || !exists("V4_T2.36")) {
  stop("Pinned RData did not expose expected KPHC table objects")
}

normalize_name <- function(x) {
  x <- iconv(as.character(x), to="ASCII//TRANSLIT")
  x <- tolower(trimws(x))
  x <- gsub("&", " and ", x, fixed=TRUE)
  x <- gsub("\\b(sub[ -]?county|constituency)\\b", " ", x)
  gsub("[^a-z0-9]+", "", x)
}

first_col <- function(df, candidates) {
  hit <- candidates[candidates %in% names(df)]
  if (length(hit) == 0) return(NULL)
  hit[[1]]
}

registry <- fromJSON("data/geography/registry/geographies.json", simplifyDataFrame=TRUE)
geos <- if (is.data.frame(registry)) registry else registry$geographies
counties <- geos[geos$level == "county", c("county_code","name","geo_code")]
const <- geos[geos$level == "constituency", c("county_code","name","geo_code","constituency_code")]
names(counties)[names(counties)=="name"] <- "county_name"
names(const)[names(const)=="name"] <- "constituency_name"
const <- merge(const, counties[,c("county_code","county_name")], by="county_code", all.x=TRUE)
const$county_norm <- normalize_name(const$county_name)
const$name_norm <- normalize_name(const$constituency_name)
const$external_adm2_pcode <- sprintf("KE%03d%03d", as.integer(const$county_code), as.integer(const$constituency_code))

codebook <- V4_T1.9
required_code_cols <- c("CountyCode","County","SubCountyCode","SubCounty")
if (!all(required_code_cols %in% names(codebook))) stop("V4_T1.9 missing expected columns: ", paste(setdiff(required_code_cols,names(codebook)),collapse=","))
codebook$county_norm <- normalize_name(codebook$County)
codebook$subcounty_norm <- normalize_name(codebook$SubCounty)
codebook$source_subcounty_pcode <- sprintf("KEN_%02d_%04d", as.integer(codebook$CountyCode), as.integer(codebook$SubCountyCode))
code_key <- paste(codebook$county_norm, codebook$subcounty_norm, sep="|")
code_counts <- table(code_key)

extract_rows <- function(df, dataset, indicator_id, value_col, weight_col, gender_total=FALSE) {
  county_col <- first_col(df, c("County","county"))
  subcounty_col <- first_col(df, c("SubCounty","Sub.County","Sub_County","Subcounty","subcounty"))
  admin_col <- first_col(df, c("AdminArea","Admin.Area","admin_area"))
  gender_col <- first_col(df, c("Gender","Sex","gender","sex"))

  if (is.null(county_col) || is.null(subcounty_col) || !(value_col %in% names(df)) || !(weight_col %in% names(df))) {
    return(list(rows=list(), controls=list(), diagnostic=list(
      dataset=dataset,status="missing_required_columns",columns=names(df),
      county_col=county_col,subcounty_col=subcounty_col,value_col=value_col,weight_col=weight_col
    )))
  }

  raw <- df
  if (gender_total && !is.null(gender_col)) {
    keep <- tolower(trimws(as.character(raw[[gender_col]]))) %in% c("total","both sexes","both")
    if (any(keep, na.rm=TRUE)) raw <- raw[keep %in% TRUE, , drop=FALSE]
  }

  control_rows <- raw[0, , drop=FALSE]
  if (!is.null(admin_col)) {
    is_county <- grepl("county", tolower(as.character(raw[[admin_col]]))) & !grepl("sub", tolower(as.character(raw[[admin_col]])))
    if (any(is_county, na.rm=TRUE)) control_rows <- raw[is_county %in% TRUE, , drop=FALSE]
  } else {
    is_blank_sub <- is.na(raw[[subcounty_col]]) | trimws(as.character(raw[[subcounty_col]])) == ""
    if (any(is_blank_sub, na.rm=TRUE)) control_rows <- raw[is_blank_sub %in% TRUE, , drop=FALSE]
  }

  controls <- list()
  if (nrow(control_rows) > 0) {
    for (j in seq_len(nrow(control_rows))) {
      cv <- suppressWarnings(as.numeric(as.character(control_rows[[value_col]][j])))
      cw <- suppressWarnings(as.numeric(as.character(control_rows[[weight_col]][j])))
      if (is.na(cv) || is.na(cw) || cw <= 0) next
      controls[[length(controls)+1]] <- list(
        dataset=dataset,indicator_id=indicator_id,
        source_county=as.character(control_rows[[county_col]][j]),
        normalized_county=normalize_name(control_rows[[county_col]][j]),
        county_value=cv,county_weight=cw,source_value_unit="percent"
      )
    }
  }

  x <- raw
  if (!is.null(admin_col)) {
    keep <- grepl("sub", tolower(as.character(x[[admin_col]])))
    if (any(keep, na.rm=TRUE)) x <- x[keep %in% TRUE, , drop=FALSE]
  }
  x <- x[!is.na(x[[subcounty_col]]) & trimws(as.character(x[[subcounty_col]])) != "", , drop=FALSE]

  out <- list()
  for (i in seq_len(nrow(x))) {
    county <- as.character(x[[county_col]][i])
    subcounty <- as.character(x[[subcounty_col]][i])
    value <- suppressWarnings(as.numeric(as.character(x[[value_col]][i])))
    weight <- suppressWarnings(as.numeric(as.character(x[[weight_col]][i])))
    if (is.na(value) || is.na(weight) || weight <= 0) next

    cn <- normalize_name(county)
    sn <- normalize_name(subcounty)
    hits <- const[const$county_norm == cn & const$name_norm == sn, , drop=FALSE]
    ck <- paste(cn,sn,sep="|")
    cb <- codebook[code_key == ck, , drop=FALSE]
    source_pcode <- if (nrow(cb)==1) cb$source_subcounty_pcode[[1]] else NULL

    out[[length(out)+1]] <- list(
      dataset=dataset,indicator_id=indicator_id,
      source_county=county,source_subcounty=subcounty,
      source_value=value,source_weight=weight,source_weight_field=weight_col,source_value_unit="percent",
      normalized_county=cn,normalized_subcounty=sn,
      source_subcounty_pcode=source_pcode,
      source_pcode_match_count=nrow(cb),
      match_count=nrow(hits),
      matched_geo_code=if (nrow(hits)==1) hits$geo_code[[1]] else NULL,
      matched_constituency=if (nrow(hits)==1) hits$constituency_name[[1]] else NULL,
      matched_external_adm2_pcode=if (nrow(hits)==1) hits$external_adm2_pcode[[1]] else NULL,
      match_status=if (nrow(hits)==1) "unique_name_candidate_crosswalk_gate_required" else if (nrow(hits)==0) "unmatched" else "ambiguous",
      publication_eligible=FALSE
    )
  }
  list(rows=out, controls=controls, diagnostic=list(
    dataset=dataset,status="ok",source_rows=nrow(x),candidate_rows=length(out),
    county_controls=length(controls),
    unique_name_matches=sum(vapply(out,function(z) z$match_count==1,logical(1))),
    source_pcode_matches=sum(vapply(out,function(z) !is.null(z$source_subcounty_pcode),logical(1)))
  ))
}

a <- extract_rows(V4_T2.2, "V4_T2.2", "IND-SCHOOL-ATTENDANCE-RATE", "StillinSchool_Perc", "Total", TRUE)
b <- extract_rows(V4_T2.36, "V4_T2.36", "IND-HOUSEHOLD-CAR-OWNERSHIP", "Car", "ConventionalHouseholds", FALSE)
c <- extract_rows(V4_T2.36, "V4_T2.36", "IND-HOUSEHOLD-MOTORCYCLE-OWNERSHIP", "Motor Cycle", "ConventionalHouseholds", FALSE)
rows <- c(a$rows,b$rows,c$rows)
controls <- c(a$controls,b$controls,c$controls)

summary <- list(
  schema_version="kda.p42.kphc-subcounty-crosswalk-probe.v2",
  generated_from=list(
    official_authority="Kenya National Bureau of Statistics",
    extraction_mirror="Shelmith-Kariuki/rKenyaCensus",
    extraction_mirror_commit="6db00e5b1b71a781e6def15dd98a4828b6d960bc",
    table_blob_shas=list(
      V4_T1_9="f5535c58e0b37614e92467375f1f47ae277f7dfc",
      V4_T2_2="fcc698f8c858123e5404149469ddbeebdd14a4f2",
      V4_T2_36="143828675c1860f958944d6cf974005a98a6983b"
    )
  ),
  decision="candidate_generation_only_documented_crosswalk_required_before_publication",
  total_candidate_rows=length(rows),
  unique_name_candidate_rows=sum(vapply(rows,function(z) z$match_count==1,logical(1))),
  source_pcode_candidate_rows=sum(vapply(rows,function(z) !is.null(z$source_subcounty_pcode),logical(1))),
  publication_eligible_rows=0,
  county_control_rows=length(controls),
  diagnostics=list(a$diagnostic,b$diagnostic,c$diagnostic),
  county_controls=controls,
  rows=rows
)

dir.create("data/p42", recursive=TRUE, showWarnings=FALSE)
write_json(summary, "data/p42/kphc-subcounty-crosswalk-probe.json", pretty=TRUE, auto_unbox=TRUE, null="null")
cat(sprintf("P42 KPHC probe: %d rows; %d source-PCode candidates; %d county controls; 0 publication-eligible before geography/reconciliation gates.\n",
            summary$total_candidate_rows, summary$source_pcode_candidate_rows, summary$county_control_rows))
