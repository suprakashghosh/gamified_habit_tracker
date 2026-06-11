import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname.startsWith("/admin")) {
    if (!ADMIN_PASSWORD) {
      return NextResponse.json(
        { error: "ADMIN_PASSWORD not configured on server" },
        { status: 500 }
      );
    }

    const authHeader = request.headers.get("authorization");

    if (!authHeader) {
      return new NextResponse("Unauthorized", {
        status: 401,
        headers: {
          "WWW-Authenticate": 'Basic realm="Admin Area"',
        },
      });
    }

    // Support both Basic auth and Bearer token
    let providedPassword = "";

    if (authHeader.startsWith("Basic ")) {
      const base64Credentials = authHeader.slice(6);
      const credentials = atob(base64Credentials);
      providedPassword = credentials.slice(credentials.indexOf(":") + 1);
    } else if (authHeader.startsWith("Bearer ")) {
      providedPassword = authHeader.slice(7);
    }

    if (providedPassword !== ADMIN_PASSWORD) {
      return new NextResponse("Unauthorized", {
        status: 401,
        headers: {
          "WWW-Authenticate": 'Basic realm="Admin Area"',
        },
      });
    }

    return NextResponse.next();
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
