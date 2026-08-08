PS C:\Users\devil\Downloads\PROTOTYPE_1.0> tree /F
Folder PATH listing for volume Windows
Volume serial number is 00000007 A81E:4E21
C:.
│   .gitignore
│   AI_ENGINE_GUIDE.md
│   check_all_py.py
│   README.md
│   requirements.txt
│   
├───ai_engin
│   │   agents_README.md
│   │   requirements_colab.txt
│   │   
│   ├───colab_training
│   │   │   config.py
│   │   │   train_all_models.ipynb
│   │   │   
│   │   ├───data
│   │   │       dataset.py
│   │   │       data_loader.py
│   │   │       feature_engineer.py
│   │   │       preprocessing.py
│   │   │       __init__.py
│   │   │       
│   │   ├───evaluation
│   │   │       evaluate_all.py
│   │   │       visualization.py
│   │   │       __init__.py
│   │   │       
│   │   ├───export
│   │   │       export_models.py
│   │   │       __init__.py
│   │   │       
│   │   ├───models
│   │   │       failure_predictor.py
│   │   │       fault_classifier.py
│   │   │       isolation_forest.py
│   │   │       meta_classifier.py
│   │   │       vae_anomaly.py
│   │   │       __init__.py
│   │   │       
│   │   └───training
│   │           losses.py
│   │           metrics.py
│   │           train_classifier.py
│   │           train_ensemble.py
│   │           train_failure.py
│   │           train_vae.py
│   │           __init__.py
│   │           
│   ├───inference
│   │       anomaly_detector.py
│   │       failure_predictor.py
│   │       fault_classifier.py
│   │       model_registry.py
│   │       pipeline.py
│   │       utils.py
│   │       __init__.py
│   │       
│   └───trained_models
│           .gitkeep
│           
├───backend
│   │   check_templates.py
│   │   manage.py
│   │   validate_api.py
│   │   
│   ├───agents
│   │   │   __init__.py
│   │   │   
│   │   ├───anomaly
│   │   │       anomaly_detection_agent.py
│   │   │       
│   │   ├───dispatch
│   │   │       maintenance_dispatch_agent.py
│   │   │       
│   │   ├───explainability
│   │   │       explainability_agent.py
│   │   │       
│   │   ├───ingestion
│   │   │       sensor_ingestion_agent.py
│   │   │       
│   │   ├───network_health
│   │   │       network_health_agent.py
│   │   │       
│   │   ├───prediction
│   │   │       failure_prediction_agent.py
│   │   │       
│   │   ├───root_cause
│   │   │       root_cause_agent.py
│   │   │       
│   │   ├───shared
│   │   │       base_agent.py
│   │   │       events.py
│   │   │       __init__.py
│   │   │       
│   │   └───speed_restriction
│   │           speed_restriction_agent.py
│   │           
│   ├───alerts
│   │       urls.py
│   │       views.py
│   │       __init__.py
│   │       
│   ├───core
│   │       context_processors.py
│   │       __init__.py
│   │       
│   ├───map_view
│   │   │   api_urls.py
│   │   │   api_views.py
│   │   │   services.py
│   │   │   urls.py
│   │   │   views.py
│   │   │   __init__.py
│   │   │   
│   │   └───route_geometry
│   │           india_railways.geojson
│   │           
│   ├───railway
│   │   │   admin.py
│   │   │   apps.py
│   │   │   models.py
│   │   │   tests.py
│   │   │   views.py
│   │   │   __init__.py
│   │   │   
│   │   ├───management
│   │   │   │   __init__.py
│   │   │   │   
│   │   │   └───commands
│   │   │           seed_demo_data.py
│   │   │           seed_master_data.py
│   │   │           seed_routes.py
│   │   │           seed_sensors.py
│   │   │           __init__.py
│   │   │           
│   │   └───migrations
│   │           0001_initial.py
│   │           0002_tracksection_uniq_track_route_direction.py
│   │           0003_tracksection_geometry.py
│   │           __init__.py
│   │           
│   ├───rakshak_project
│   │       asgi.py
│   │       settings.py
│   │       urls.py
│   │       wsgi.py
│   │       __init__.py
│   │       
│   ├───sensors
│   │       urls.py
│   │       views.py
│   │       __init__.py
│   │       
│   └───tickets
│           urls.py
│           views.py
│           __init__.py
│           
├───demo_assets
│       demo_scenario.md
│       
├───docs
│   ├───architecture
│   │       system_overview.md
│   │       
│   └───reports
│           PHASE_REPORT.md
│           
├───frontend
│   ├───static
│   │   ├───css
│   │   │       dashboard.css
│   │   │       
│   │   ├───images
│   │   │       .gitkeep
│   │   │       
│   │   └───js
│   │           dashboard.js
│   │           map.js
│   │           train_simulation.js
│   │           
│   └───templates
│           alerts.html
│           base.html
│           dashboard.html
│           map.html
│           tickets.html
│           
├───notebooks
│       colab_training_tutorial.md
│       requirements-colab.txt
│       section_0.py
│       section_1.py
│       section_2.py
│       section_3.py
│       section_4.py
│       section_5.py
│       section_6.py
│       section_7.py
│       SHARED_CONTRACT.md
│       train_colab.ipynb
│       train_colab.py
│       
└───presentation
        .gitkeep