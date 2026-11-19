import argparse

import uvicorn


def main() -> None:
    parser = argparse.ArgumentParser(prog="localtube", description="Ad-free local YouTube player")
    parser.add_argument("--host", default="127.0.0.1", help="use 0.0.0.0 to reach it from other devices on your LAN")
    parser.add_argument("--port", type=int, default=8000)
    args = parser.parse_args()
    print(f"LocalTube on http://{args.host}:{args.port}")
    uvicorn.run("localtube.app:app", host=args.host, port=args.port)


if __name__ == "__main__":
    main()
