import argparse

import uvicorn


def main() -> None:
    parser = argparse.ArgumentParser(prog="localtube", description="Ad-free local YouTube player (API server)")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8000)
    parser.add_argument("--reload", action="store_true", help="restart on code changes (development)")
    parser.add_argument("--no-access-log", action="store_true", help="when a proxy in front already logs requests")
    args = parser.parse_args()
    uvicorn.run(
        "localtube.app:app",
        host=args.host,
        port=args.port,
        reload=args.reload,
        # Exactly one worker on purpose: the extraction cache and download jobs live in this
        # process's memory, so extra workers would each see a different state.
        workers=1,
        proxy_headers=True,
        forwarded_allow_ips="127.0.0.1",
        access_log=not args.no_access_log,
        server_header=False,
        # Open video streams would otherwise keep the server from stopping until killed.
        timeout_graceful_shutdown=5,
    )


if __name__ == "__main__":
    main()
