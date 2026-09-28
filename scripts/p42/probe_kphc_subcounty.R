#!/usr/bin/env Rscript
suppressPackageStartupMessages({
  library(jsonlite)
  library(rKenyaCensus)
})

normalize_name <- function(x) {
  x <- iconv(as.character(x), to="ASCII//TRANSLIT")
  x <- tolower(trimws(x))
  x <- gsub("&", " and ", x, fixed=TRUE)
  x <- gsub("\\b(sub[ -]?county|constituency)\\b", " ", x)
  x <- gsub("[^a-z0-9]+", "", x)
  x
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

extract_rows <- function(df, dataset, indicator_id, value_col, weight_col, gender_total=FALSE) {
  county_col <- first_col(df, c("County","county"))
  subcounty_col <- first_col(df, c("SubCounty","Sub.County","Sub_County","Subcounty","subcounty"))
  admin_col <- first_col(df, c("AdminArea","Admin.Area","admin_area"))
  gender_col <- first_col(df, c("Gender","Sex","gender","sex"))

  if (is.null(county_col) || is.null(subcounty_col) || !(value_col %in% names(df)) || !(weight_col %in% names(df))) {
    return(list(rows=list(), controls=list(), diagnostic=list(dataset=dataset,status="missing_required_columns",
      columns=names(df), county_col=county_col, subcounty_col=subcounty_col, value_col=value_col, weight_col=weight_col)))
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
        dataset=dataset,
        indicator_id=indicator_id,
        source_county=as.character(control_rows[[county_col]][j]),
        normalized_county=normalize_name(control_rows[[county_col]][j]),
        county_value=cv,
        county_weight=cw,
        source_value_unit="percent"
      )
    }
  }

  x <- raw
  if (!is.null(admin_col)) {
    keep <- grepl("sub", tolower(as.character(x[[admin_col]])))
    if (any(keep, na.rm=TRUE)) x <- x[keep %in% TRUE, , drop=FALSE]
  }
  if (gender_total && !is.null(gender_col)) {
    keep <- tolower(trimws(as.character(x[[gender_col]]))) %in% c("total","both sexes","both")
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
    cn <- normalize_name(county); sn <- normalize_name(subcounty)
    hits <- const[const$county_norm == cn & const$name_norm == sn, , drop=FALSE]
    out[[length(out)+1]] <- list(
      dataset=dataset,
      indicator_id=indicator_id,
      source_county=county,
      source_subcounty=subcounty,
      source_value=value,
      source_weight=weight,
      source_weight_field=weight_col,
      source_value_unit="percent",
      normalized_county=cn,
      normalized_subcounty=sn,
      match_count=nrow(hits),
      matched_geo_code=if (nrow(hits)==1) hits$geo_code[[1]] else NULL,
      matched_constituency=if (nrow(hits)==1) hits$constituency_name[[1]] else NULL,
      matched_external_adm2_pcode=if (nrow(hits)==1) hits$external_adm2_pcode[[1]] else NULL,
      match_status=if (nrow(hits)==1) "unique_name_candidate_geometry_gate_required" else if (nrow(hits)==0) "unmatched" else "ambiguous",
      publication_eligible=FALSE
    )
  }
  list(rows=out, controls=controls, diagnostic=list(dataset=dataset,status="ok",source_rows=nrow(x),candidate_rows=length(out),
    county_controls=length(controls), unique_name_matches=sum(vapply(out,function(z) z$match_count==1,logical(1)))))
}

a <- extract_rows(V4_T2.2, "V4_T2.2", "IND-SCHOOL-ATTENDANCE-RATE", "StillinSchool_Perc", "Total", TRUE)
b <- extract_rows(V4_T2.36, "V4_T2.36", "IND-HOUSEHOLD-CAR-OWNERSHIP", "Car", "ConventionalHouseholds", FALSE)
c <- extract_rows(V4_T2.36, "V4_T2.36", "IND-HOUSEHOLD-MOTORCYCLE-OWNERSHIP", "Motor Cycle", "ConventionalHouseholds", FALSE)
rows <- c(a$rows,b$rows,c$rows)
controls <- c(a$controls,b$controls,c$controls)

summary <- list(
  schema_version="kda.p42.kphc-subcounty-crosswalk-probe.v1",
  generated_from=list(
    official_authority="Kenya National Bureau of Statistics",
    extraction_mirror="Shelmith-Kariuki/rKenyaCensus",
    extraction_mirror_commit="6db00e5b1b71a781e6def15dd98a4828b6d960bc"
  ),
  decision="candidate_generation_only_geometry_or_official_crosswalk_required_before_publication",
  total_candidate_rows=length(rows),
  unique_name_candidate_rows=sum(vapply(rows,function(z) identical(z$match_status,"unique_name_candidate_geometry_gate_required"),logical(1))),
  publication_eligible_rows=0,
  county_control_rows=length(controls),
  diagnostics=list(a$diagnostic,b$diagnostic,c$diagnostic),
  county_controls=controls,
  rows=rows
)

dir.create("data/p42", recursive=TRUE, showWarnings=FALSE)
write_json(summary, "data/p42/kphc-subcounty-crosswalk-probe.json", pretty=TRUE, auto_unbox=TRUE, null="null")
cat(sprintf("P42 KPHC probe: %d rows; %d unique name candidates; 0 publication-eligible until equivalence gate.\n",
            summary$total_candidate_rows, summary$unique_name_candidate_rows))
