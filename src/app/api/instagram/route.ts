import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const handle = searchParams.get("handle");

  if (!handle) {
    return NextResponse.json({ error: "Handle is required" }, { status: 400 });
  }

  const cleanHandle = handle.replace("@", "").trim();

  try {
    const response = await fetch(
      `https://instagram-scraper-stable-api.p.rapidapi.com/ig_get_fb_profile_hover.php?username_or_url=${encodeURIComponent(cleanHandle)}`,
      {
        method: "GET",
        headers: {
          "x-rapidapi-key": process.env.RAPIDAPI_KEY!,
          "x-rapidapi-host": "instagram-scraper-stable-api.p.rapidapi.com",
        },
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Instagram API error:", errorText);
      return NextResponse.json(
        { error: "Failed to fetch Instagram profile" },
        { status: response.status }
      );
    }

    const data = await response.json();

    if (data.error) {
      return NextResponse.json(
        { error: data.error },
        { status: 400 }
      );
    }

    const userData = data.user_data;

    if (!userData) {
      return NextResponse.json(
        { error: "User not found" },
        { status: 404 }
      );
    }

    // Get HD profile pic if available
    const profilePicUrl = userData.hd_profile_pic_url_info?.url || userData.profile_pic_url;

    return NextResponse.json({
      username: userData.username,
      full_name: userData.full_name,
      profile_pic_url: profilePicUrl,
      follower_count: userData.follower_count,
      following_count: userData.following_count,
      media_count: userData.media_count,
      is_private: userData.is_private,
      is_verified: userData.is_verified,
    });
  } catch (error) {
    console.error("Instagram lookup error:", error);
    return NextResponse.json(
      { error: "Failed to fetch Instagram profile" },
      { status: 500 }
    );
  }
}
