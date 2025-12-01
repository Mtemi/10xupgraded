@app.route('/apa/user/<username>/<bot_id>', methods=['POST'])
def deploy_bot(username, bot_id):
    logger.info(f"Received deployment request for username: {username} and bot_id: {bot_id}")

    # Validate authentication
    auth_header = request.headers.get('Authorization', '')
    token = auth_header.split(' ', 1)[1] if auth_header.startswith('Bearer ') else None
    logger.info("Extracted token from header: %s", token)

    user_info = verify_token_and_get_user(token, username)
    if not user_info:
        logger.warning("Invalid or unauthorized token for username: %s", username)
        return jsonify({"error": "Invalid or unauthorized user"}), 401

    user_id = user_info.get("id")
    logger.info("Authenticated user_id: %s", user_id)

    data = request.get_json()
    namespace = bot_id
    strategy_name = bot_id.strip()
    strategy_class = strategy_name.capitalize()

    logger.info("Using strategy name/class: %s", strategy_class)

    # Fetch strategy code
    strategy_query = supabase.rpc("get_strategy_content", {
        "p_strategy_name": strategy_name,
        "p_user_id": user_id
    }).execute()

    if not strategy_query.data:
        logger.warning(f"No strategy found for name: {strategy_name}")
        return jsonify({"error": "Strategy not found in Supabase"}), 404

    strategy_code = strategy_query.data

    try:
        # 1. Save strategy file
        strategy_path = f"/home/ubuntu/freqtrade-k8s-helm-chart/strategies/{strategy_class}.py"
        with open(strategy_path, "w") as f:
            f.write(strategy_code)
        logger.info("Strategy saved at: %s", strategy_path)

        # 2. Prepare user values YAML
        values_path = f"/home/ubuntu/freqtrade-k8s-helm-chart/user-values-{namespace}.yaml"
        user_values = {
            "config": {
                "timeframe": data.get("timeframe", "5m"),
                "stoploss": data.get("stoploss", -0.10),
                "trailing_stop": data.get("trailing_stop", False),
                "trailing_only_offset_is_reached": data.get("trailing_only_offset_is_reached", True),
                "trailing_stop_positive": data.get("trailing_stop_positive", 0.01),
                "trailing_stop_positive_offset": data.get("trailing_stop_positive_offset", 0.03),
                "use_custom_stoploss": False,
                "has_downtime_protection": False,
                "hold_support_enabled": True,
                "process_only_new_candles": data.get("process_only_new_candles", True),
                "use_exit_signal": data.get("use_exit_signal", False),
                "exit_profit_only": data.get("exit_profit_only", True),
                "ignore_roi_if_entry_signal": data.get("ignore_roi_if_entry_signal", True),
                "stake_amount_type": "quote_currency",
                "entry_pricing": data.get("entry_pricing", {
                    "price_side": "other",
                    "use_order_book": True,
                    "order_book_top": 1,
                    "price_last_balance": 0,
                    "check_depth_of_market": {"enabled": False, "bids_to_ask_delta": 1}
                }),
                "exit_pricing": data.get("exit_pricing", {
                    "price_side": "other",
                    "use_order_book": True,
                    "order_book_top": 1
                }),
                "dataformat_ohlcv": data.get("dataformat_ohlcv", "feather"),
                "dataformat_trades": data.get("dataformat_trades", "feather"),
                "download_trades": True,
                "dry_run": data.get("dry_run", True),
                "dry_run_wallet": data.get("dry_run_wallet", 4000),
                "stake_amount": data.get("stake_amount", "unlimited"),
                "position_adjustment_enable": data.get("position_adjustment_enable", True),
                "trading_mode": data.get("trading_mode", "spot"),
                "max_open_trades": data.get("max_open_trades", 3),
                "amend_last_stake_amount": True,
                "stake_currency": data.get("stake_currency", "USDT"),
                "tradable_balance_ratio": data.get("tradable_balance_ratio", 0.99),
                "fiat_display_currency": data.get("fiat_display_currency", "EUR"),
                "db_url": f"sqlite:////freqtrade/user_data/{namespace}-tradesv3.sqlite",
                "cancel_open_orders_on_exit": data.get("cancel_open_orders_on_exit", False),
                "order_types": data.get("order_types", {
                    "entry": "market",
                    "force_entry": "market",
                    "force_exit": "market",
                    "exit": "limit",
                    "stoploss": "market",
                    "stoploss_on_exchange": False
                }),
                "minimal_roi": data.get("minimal_roi", {"0": 0.1, "20160": 0.09, "40160": 0}),
                "unfilledtimeout": data.get("unfilledtimeout", {
                    "entry": 10,
                    "exit": 30,
                    "exit_timeout_count": 0,
                    "unit": "minutes"
                }),
                "exchange": data.get("exchange", {}),
                "pair_whitelist": data.get("exchange", {}).get("pair_whitelist", []),
                "pair_blacklist": data.get("exchange", {}).get("pair_blacklist", []),
                "pairlists": data.get("pairlists", []),
                "freqai": data.get("freqai", {}),
                "telegram": {
                    "keyboard": [
                        ["/forcelong", "/balance", "/profit", "/reload_config", "/stopentry"],
                        ["/status table", "/performance", "/mix_tags", "/start", "/stop"],
                        ["/show_config", "/whitelist", "/logs", "/trades", "/forceexit"]
                    ]
                },
                "api_server": {
                    "enabled": True,
                    "listen_ip_address": "0.0.0.0",
                    "listen_port": 8084,
                    "verbosity": "error",
                    "enable_openapi": True,
                    "jwt_secret_key": "235573d45bb26d0cbf1986893b12d4aaf0cf4934f3566d9459d818ec7fbb851b",
                    "ws_token": "acnQI1n44GG9lJ51fLKqWQvVJF5k5q7xsw",
                    "CORS_origins": ["http://127.0.0.1:8084", "http://localhost:8084", "http://0.0.0.0:8084"],
                    "username": "freqtrade",
                    "password": "&&Random!!"
                },
                "initial_state": data.get("initial_state", "running"),
                "force_entry_enable": True,
                "internals": data.get("internals", {"process_throttle_secs": 5})
            },
            "backtesting": {
                "enabled": False,
                "download_data": False,
                "timerange": None,
                "timeframes": "1h",
                "strategy_list": "Strategy005",
                "fee": None,
                "pvc_size": data.get("backtesting", {}).get("pvc_size", "1Gi"),
                "results": {
                    "enable_export": False,
                    "reader_enabled": False,
                    "pvc_size": data.get("backtesting", {}).get("results", {}).get("pvc_size", "1Gi")
                }
            },
            "bot": {
                "debug": False,
                "debuglevel": "-vvv",
                "enabled": True,
                "pvc_size": data.get("persistence", {}).get("size", "1Gi"),
                "freqaimodel": "LightGBMRegressor",
                "strategy_name": strategy_class,
                "args": [
                    "trade",
                    "--rpc-enabled",
                    "--config", f"/freqtrade/config/config-{namespace}.json",
                    "--config", f"/freqtrade/configcreds/configcreds-{namespace}.json",
                    "--strategy", strategy_class,
                    "--db-url", f"sqlite:////freqtrade/user_data/{namespace}-tradesv3.sqlite"
                ]
            },
            "image": {
                "base": "docker.io/freqtradeorg/freqtrade",
                "tag": "2024.1_freqairl"
            },
            "ingress": {
                "enabled": True,
                "host": "10xtraders.ai",
                "path": f"/user/{namespace}"
            },
            "create_config_configmap": True,
            "create_strategies_configmap": True,
            "strategies": [],
            "configcreds": {
                "bot": {"bot_name": f"freqtrade-{namespace}"},
                "exchange": {
                    "name": data.get("exchange", {}).get("name", "binance")
                },
                "telegram": {
                    "enabled": bool(data.get("telegram", {}).get("enabled", False)),
                    "token": data.get("telegram", {}).get("token", ""),
                    "chat_id": data.get("telegram", {}).get("chat_id", "")
                },
                "api_server": {
                    "enabled": True,
                    "username": "meghan",
                    "password": user_id
                }
            },
            "kubernetes": {
                "nodePort": 30080
            }

        }

        with open(values_path, "w") as f:
            yaml.safe_dump(user_values, f)
        logger.info("User values YAML written: %s", values_path)

        # 3. Create Namespace if missing
        subprocess.run(["kubectl", "create", "namespace", namespace], capture_output=True)

        # 4. Deploy with Helm template
        helm_cmd = [
            "helm", "template",
            "-f", values_path,
            "--set", f"configcreds.exchange.key={data['exchange'].get('key', '')}",
            "--set", f"configcreds.exchange.secret={data['exchange'].get('secret', '')}",
            "--set", f"configcreds.telegram.token={data['telegram'].get('token', '')}",
            "--set", f"configcreds.api_server.username=meghan",
            "--set", f"configcreds.api_server.password={user_id}",
            "--set", f"bot.strategy_name={strategy_class}",
            "--set", "bot.args[0]=trade",
            "--set", "bot.args[1]=--rpc-enabled",
            "-n", namespace,
            "/home/ubuntu/freqtrade-k8s-helm-chart"
        ]

        logger.info("Executing Helm template...")
        rendered = subprocess.run(helm_cmd, capture_output=True, text=True)

        if rendered.returncode != 0:
            logger.error("Helm template failed: %s", rendered.stderr)
            return jsonify({"error": "Helm template failed", "details": rendered.stderr}), 500

        kubectl_apply = subprocess.run(["kubectl", "apply", "-n", namespace, "-f", "-"],
                                       input=rendered.stdout, text=True, capture_output=True)
        if kubectl_apply.returncode != 0:
            logger.error("kubectl apply failed: %s", kubectl_apply.stderr)
            return jsonify({"error": "Kubernetes apply failed", "details": kubectl_apply.stderr}), 500

        # 5. Create personalized Ingress
        ingress_yaml = f"""
            apiVersion: networking.k8s.io/v1
            kind: Ingress
            metadata:
            name: ingress-{namespace}
            namespace: {namespace}
            annotations:
                nginx.ingress.kubernetes.io/rewrite-target: /
            spec:
            rules:
            - host: 10xtraders.ai
                http:
                paths:
                - path: /user/{namespace}
                    pathType: Prefix
                    backend:
                    service:
                        name: freqtrade-{namespace}
                        port:
                        number: 8084
            """
        ingress_path = f"/tmp/ingress-{namespace}.yaml"
        with open(ingress_path, "w") as f:
            f.write(ingress_yaml)

        subprocess.run(["kubectl", "apply", "-f", ingress_path], capture_output=True)
        logger.info("Ingress applied for namespace: %s", namespace)

        # Success response
        return jsonify({
            "status": "deploying",
            "message": f"Bot deployment initiated successfully for {namespace}",
            "namespace": namespace
        })

    except Exception as e:
        logger.exception("Unexpected error during deployment")
        return jsonify({"error": str(e)}), 500