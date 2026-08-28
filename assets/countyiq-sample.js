(function(){
  'use strict';
  window.COUNTYIQ_SAMPLE={
    meta:{
      mode:'sample',
      label:'Bundled sample snapshot',
      purpose:'Keeps CountyIQ inspectable when production CSV requests are unavailable, including local/offline viewing.',
      core_values:'Source-backed snapshot copied from the published Sprint 1 county GCP, FY2024/25 budget and 2022 voter files.',
      preview_values:'Illustrative product-preview fields are synthetic and must never be used as factual county statistics.',
      updated:'2026-08-28'
    },
    rows:[
      {geo_code:'KEN-C001',name:'Mombasa',gcp2020:469299,gcp2021:528840,gcp2022:605258,gcp2023:670023,gcp2024:711088,budget:17360.0,expenditure:13316.23,devAbsorption:62,absorption:77,voters:641913},
      {geo_code:'KEN-C004',name:'Tana River',gcp2020:29469,gcp2021:35516,gcp2022:37693,gcp2023:43484,gcp2024:51145,budget:9177.72,expenditure:6705.90,devAbsorption:56,absorption:73,voters:141096},
      {geo_code:'KEN-C022',name:'Kiambu',gcp2020:555593,gcp2021:618360,gcp2022:695551,gcp2023:760998,gcp2024:819834,budget:23480.38,expenditure:16495.58,devAbsorption:37,absorption:70,voters:1275008},
      {geo_code:'KEN-C023',name:'Turkana',gcp2020:107455,gcp2021:111946,gcp2022:133309,gcp2023:155744,gcp2024:178441,budget:17213.59,expenditure:13548.66,devAbsorption:65,absorption:79,voters:238528},
      {geo_code:'KEN-C032',name:'Nakuru',gcp2020:479851,gcp2021:565879,gcp2022:633411,gcp2023:755946,gcp2024:771775,budget:23980.40,expenditure:15965.37,devAbsorption:42,absorption:67,voters:1054856},
      {geo_code:'KEN-C047',name:'Nairobi City',gcp2020:2685707,gcp2021:3001449,gcp2022:3453792,gcp2023:3834171,gcp2024:4105576,budget:43564.27,expenditure:33523.47,devAbsorption:29,absorption:77,voters:2415310}
    ],
    previews:{
      'KEN-C032':{
        peer_group:'Regional growth hub',
        development_performance_index:67.4,
        delivery_accountability_score:63.8,
        trend_label:'Improving',
        peer_rank:'2 of 7',
        development_gap:{label:'Development execution gap',value:'KES 1.2bn',basis:'Illustrative gap to a sample peer benchmark'},
        opportunities:[
          {title:'Climate-resilient urban infrastructure facility',status:'Demo record',fit:'Urban growth + infrastructure'},
          {title:'County health systems technical assistance',status:'Demo record',fit:'Service delivery'},
          {title:'Agribusiness value-chain financing window',status:'Demo record',fit:'Regional agriculture + logistics'}
        ]
      },
      'KEN-C001':{peer_group:'Major metropolitan/coastal',development_performance_index:69.1,delivery_accountability_score:66.2,trend_label:'Improving',peer_rank:'2 of 4'},
      'KEN-C004':{peer_group:'Low-density riverine/arid',development_performance_index:48.6,delivery_accountability_score:54.7,trend_label:'Mixed',peer_rank:'5 of 8'},
      'KEN-C022':{peer_group:'Metropolitan growth belt',development_performance_index:73.2,delivery_accountability_score:61.4,trend_label:'Improving',peer_rank:'1 of 6'},
      'KEN-C023':{peer_group:'ASAL/resource frontier',development_performance_index:50.8,delivery_accountability_score:58.1,trend_label:'Improving',peer_rank:'4 of 8'},
      'KEN-C047':{peer_group:'National metropolitan core',development_performance_index:78.5,delivery_accountability_score:68.9,trend_label:'Improving',peer_rank:'1 of 1'}
    }
  };
})();
