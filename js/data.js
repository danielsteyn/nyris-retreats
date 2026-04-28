// Nyris Retreats — Property Data
// Source: Hospitable API (snapshot). Edit via /admin to override copy/order.

const NYRIS = {
  brand: {
    name: "Nyris Retreats",
    tagline: "Top 1% Guest Favorite stays. Curated by a Superhost.",
    description: "Hand-picked vacation homes across the Gulf Coast, Texas Hill Country, and Broken Bow — every one a Top 1% Guest Favorite, hosted personally by a 5-star Superhost.",
    email: "stay@nyrisretreats.com",
    phone: "+1 (817) 555-0142",
    instagram: "nyrisretreats",
    totalReviews: 208,
    avgRating: 5.0,
    foundedYear: 2023,
    superhostSince: 2024
  },
  destinations: [
    { slug: "gulf-shores", name: "Gulf Shores", state: "Alabama", tagline: "Sugar-white sand & sunset balconies", image: "https://assets.hospitable.com/property_images/1597444/Lm15xbpAlhpFK2m1TVqQMu9kKk5JXukcSaaWLfEP.jpg", count: 2 },
    { slug: "bolivar-peninsula", name: "Bolivar Peninsula", state: "Texas", tagline: "Drive-on beach & hot tub nights", image: "https://assets.hospitable.com/property_images/1574508/J4AWxWdNVx0riannl63U4j8SZgj4dWjTlS3fmQZo.jpg", count: 1 },
    { slug: "broken-bow", name: "Broken Bow", state: "Oklahoma", tagline: "Pinewoods, ponds & private pool", image: "https://assets.hospitable.com/property_images/1605954/0nHIh9LmL4RykThYVcEetYU1C6Fm43PrGrZGHKJx.jpg", count: 1 },
    { slug: "dfw-metroplex", name: "DFW Metroplex", state: "Texas", tagline: "Lakefront & modern farmhouse stays", image: "https://assets.hospitable.com/property_images/2265618/rnrh0yaSqGKV3v9Y5ikhR41bxoR8jELShKPxe2fK.jpg", count: 2 }
  ],
  properties: [
    {
      id: "49aaf41b-c67b-466a-a066-d9a2de6e6c4f",
      slug: "crystal-beach",
      name: "Crystal Beach Hideaway",
      tagline: "Hot Tub & Direct Beach Access",
      city: "Bolivar Peninsula",
      state: "TX",
      destination: "bolivar-peninsula",
      country: "United States",
      coords: { lat: 29.4716446, lng: -94.5939284 },
      type: "Beach House",
      capacity: { guests: 12, bedrooms: 4, beds: 8, bathrooms: 2.5 },
      basePrice: 389,
      cleaningFee: 250,
      petsAllowed: true,
      reviewCount: 55,
      rating: 5.0,
      isGuestFavorite: true,
      summary: "A bright, family-friendly beach house with a 14-ft elevated deck, hot tub, tiki bar, and a 2-minute walk (or drive) to the sand. Sleeps 12 across 4 bedrooms with thoughtful touches for kids and pups alike.",
      highlights: [
        "Direct drive-on beach access — golf cart, walk, or drive",
        "Private hot tub with privacy screen",
        "Tiki bar with seating for 6 + outdoor games",
        "Fenced dog run (small pups welcome)",
        "Starlink high-speed Wi-Fi"
      ],
      experiences: [
        "Sunset stroll on Crystal Beach — 2-minute walk from the deck",
        "Charter a fishing boat from Rollover Pass",
        "Galveston ferry day trip (free, 18 minutes each way)",
        "Bolivar Lighthouse photo stop"
      ],
      amenities: ["Hot tub", "Pool access at beach", "Direct beach access", "EV charger (NEMA 14-50)", "Fully stocked kitchen", "Washer & dryer", "Hammocks", "Outdoor shower", "Fire pit area", "Charcoal grill", "Game console", "High chair", "Pack-n-play", "Pet friendly", "Starlink Wi-Fi", "AC", "Heating", "Smart TVs in every room"],
      images: [
        "https://assets.hospitable.com/property_images/1574508/yxvYBc1KQFoXAS6kvOk62wMsrxKcnaI5z8HJQP1z.jpg",
        "https://assets.hospitable.com/property_images/1574508/LMPbF99a1AdLNA4FfbfmfVCVPfOUXNIHnpKPV5hR.jpg",
        "https://assets.hospitable.com/property_images/1574508/J4AWxWdNVx0riannl63U4j8SZgj4dWjTlS3fmQZo.jpg",
        "https://assets.hospitable.com/property_images/1574508/QnHYPtzWdUsXD3jJnxbcJN8PLZgGnmrSs6Du3Oew.jpg",
        "https://assets.hospitable.com/property_images/1574508/bwy2LPmhompy0Zg21PIBPeGZLg3kDGwboUXE8saA.jpg",
        "https://assets.hospitable.com/property_images/1574508/InHH5lt39ABa51akikkrzYvCf4dw3TMxOlhSqWmx.jpg",
        "https://assets.hospitable.com/property_images/1574508/cBwkbjbEt9sIsSKaMRsiue01hrTfiPPgJrStv3H2.jpg",
        "https://assets.hospitable.com/property_images/1574508/rht6HrSKgWZ9zFRLgK94ryj3hEpGmv5k3yyQ5Ec7.jpg",
        "https://assets.hospitable.com/property_images/1574508/mfbYgxTHwRXEtxXrblD6by2Ixi23L2cdosOZv3uM.jpg",
        "https://assets.hospitable.com/property_images/1574508/AOoSVJuWNgYE75pfrTBJ2i5XufElis2rXUgPfyVx.jpg",
        "https://assets.hospitable.com/property_images/1574508/7DJzLH2F1wtGkprI5lzJ8bLlLnvMRKDw2dmdZYFw.jpg",
        "https://assets.hospitable.com/property_images/1574508/4aAxwAdTqlAfKILM7IdlCTzRMwhEiLrsOlGVMcM2.jpg"
      ],
      reviews: [
        { author: "Recent guest", date: "April 2026", rating: 5, text: "Wonderful host! Beautiful house! Would definitely recommend." },
        { author: "Family of five", date: "April 2026", rating: 5, text: "Better than we could have imagined. The open floor plan made it feel very spacious. Everything was super clean! The hot tub is a wonderful bonus after a day at the beach." },
        { author: "Verified Airbnb guest", date: "March 2026", rating: 5, text: "We had an absolutely amazing stay! From the moment we arrived, everything exceeded our expectations. The hosts truly went above and beyond — everything we could possibly need was fully stocked." },
        { author: "Verified Airbnb guest", date: "March 2026", rating: 5, text: "Best beach house on the block! Rooms are really nice, the decoration is on point. Amazing view, and literally a 2-minute walk from the beach." },
        { author: "Verified Airbnb guest", date: "February 2026", rating: 5, text: "The house looked even better in person — enjoyed every minute of it." },
        { author: "Verified Airbnb guest", date: "February 2026", rating: 5, text: "Perfect vacation home for myself and family. This home and host met every expectation." }
      ]
    },
    {
      id: "289f1407-6ef6-4c7c-bf80-12f9c7551b52",
      slug: "gulf-shores-surf-side",
      name: "Surf Side Beachfront",
      tagline: "Rare 3BR/3BA on the Sand",
      city: "Gulf Shores",
      state: "AL",
      destination: "gulf-shores",
      country: "United States",
      coords: { lat: 30.2445142, lng: -87.7085341 },
      type: "Beachfront Condo",
      capacity: { guests: 8, bedrooms: 3, beds: 5, bathrooms: 3 },
      basePrice: 329,
      cleaningFee: 175,
      petsAllowed: false,
      reviewCount: 53,
      rating: 5.0,
      isGuestFavorite: true,
      summary: "Wake up to the sound of waves in this beautifully updated 3-bedroom condo — every bedroom has its own bathroom, and the private balcony opens directly onto the Gulf. Low-density complex means quieter beach days.",
      highlights: [
        "Direct beachfront — toes in sand under a minute",
        "Every bedroom has its own bathroom",
        "Two pools + two kiddie pools at the property",
        "Dolphin watching from the balcony",
        "Walk to restaurants, ice cream, and shops"
      ],
      experiences: [
        "Sunrise dolphin watch from your balcony",
        "Hangout Music Festival walking distance (May)",
        "Gulf State Park — 6,000 acres, 28 miles of trails",
        "Souvenir shopping at The Wharf (15 min)"
      ],
      amenities: ["Beachfront", "2 pools + kiddie pools", "Elevator building", "Every bedroom has private bath", "Full kitchen", "Washer & dryer", "Sea view balcony", "Ocean sound system", "Smart TVs", "AC", "Outdoor showers", "Sun loungers", "Fully stocked"],
      images: [
        "https://assets.hospitable.com/property_images/1597444/GnM9lNPnUNg1YlgZmf9tgpIBFS78yhmM4hwgddr4.jpg",
        "https://assets.hospitable.com/property_images/1597444/vo5GvuYMggiSZ6XwVIDpPPJ8bdoGNUgQnHQxjlA6.jpg",
        "https://assets.hospitable.com/property_images/1597444/Lm15xbpAlhpFK2m1TVqQMu9kKk5JXukcSaaWLfEP.jpg",
        "https://assets.hospitable.com/property_images/1597444/V42LpMH6XVhx3unbNlINZjm9rptmWHzopA339aC9.jpg",
        "https://assets.hospitable.com/property_images/1597444/t0B7Yr2vAFpkJGfjodMITAStm5dNFNRLoZCYdk3n.jpg",
        "https://assets.hospitable.com/property_images/1597444/V4JOvRJ9SyBDp2hN3cG9TXQwBv1xjGMMzqtMj0fM.jpg",
        "https://assets.hospitable.com/property_images/1597444/2OuAOpU6zbVoNqu2bQu4SHFfMT4ri1yUF4usGhLN.jpg",
        "https://assets.hospitable.com/property_images/1597444/dVZ50Rw6AidW1irq2CBOAMMcSGTF1XNLB2GBJezm.jpg",
        "https://assets.hospitable.com/property_images/1597444/eef8Hrx23UAxRWWS4Gt1ahXqv94k7VUmj3Tf4zQK.jpg",
        "https://assets.hospitable.com/property_images/1597444/u0xdTYzxXT0Tbl7SbsctLhQgV9xdSvKmivDpavVr.jpg",
        "https://assets.hospitable.com/property_images/1597444/aN3Uij7bwIO8ppeUafbrVxEhfQuwJojeT7taYdmV.jpg",
        "https://assets.hospitable.com/property_images/1597444/9s8j2H2f5LF15tKIwJQozfwoEIozoA8gBFbQBc0C.jpg"
      ],
      reviews: [
        { author: "Recent Airbnb guest", date: "April 2026", rating: 5, text: "This place was amazing! Hands down the cleanest Airbnb I've rented to date. The complex itself was small and very quiet! Very cold AC and TVs in every room were also added bonuses." },
        { author: "Family of four", date: "April 2026", rating: 5, text: "So beautiful and peaceful. We enjoyed the space as a family of 4. The listing is complete with all that you'll need. We enjoyed the balcony overlooking the water daily, ease of access to pool and beach." },
        { author: "Verified guest", date: "April 2026", rating: 5, text: "We had a wonderful stay! The condo looks exactly like the photos, is very well equipped, and it was so convenient that every bedroom has its own bathroom. We even watched dolphins from the balcony!" },
        { author: "Spring break family", date: "April 2026", rating: 5, text: "Love, love, love this place. The condo was exactly what we wanted for our family's spring break. We enjoyed peaceful mornings on the balcony. Being right on the beach made it so easy to come and go." },
        { author: "Verified guest", date: "March 2026", rating: 5, text: "Wonderful location, very clean, perfect spot for an amazing Gulf Shores get away." },
        { author: "Verified guest", date: "March 2026", rating: 5, text: "Sheena was a great host. Nice convenient location with all the amenities in the kitchen we needed. Pool and beach were never crowded." }
      ]
    },
    {
      id: "9c8354ca-e81c-4d87-9fbe-62da16fcb7fe",
      slug: "broken-bow-cabin",
      name: "Deer Friends Cabin",
      tagline: "Heated Pool, Pond & Hot Tub",
      city: "Broken Bow",
      state: "OK",
      destination: "broken-bow",
      country: "United States",
      coords: { lat: 34.1855802, lng: -94.7860621 },
      type: "Luxury Cabin",
      capacity: { guests: 12, bedrooms: 4, beds: 9, bathrooms: 3.5 },
      basePrice: 449,
      cleaningFee: 275,
      petsAllowed: false,
      reviewCount: 61,
      rating: 5.0,
      isGuestFavorite: true,
      summary: "A 4-bedroom luxury cabin tucked into the pinewoods of Hochatown — with a heated private pool, fishing pond, hot tub overlooking the water, fire pit, and an arcade-stocked bunkroom for the kids.",
      highlights: [
        "Heated private pool (optional, +$100/night)",
        "Hot tub with pond views",
        "Fishing pond + s'mores firepit by the water",
        "Bunkroom gameroom with Pac-Mania arcade",
        "Floor-to-ceiling forest views",
        "Outdoor TV + fireplace lounge"
      ],
      experiences: [
        "Hike Beavers Bend State Park (10 min away)",
        "Float trip on Lower Mountain Fork River",
        "Hochatown Distilling Co. tasting tour",
        "Cypress Creek Vineyards wine flight",
        "Beavers Bend Adventures zipline"
      ],
      amenities: ["Heated private pool", "Hot tub", "Fishing pond", "Fire pit", "Outdoor TV", "Arcade machine", "Game console", "Fireplace", "Fully stocked kitchen", "Washer & dryer", "EV charger", "BBQ grill", "Stocked starter pantry", "Smart TVs"],
      images: [
        "https://assets.hospitable.com/property_images/1605954/0nHIh9LmL4RykThYVcEetYU1C6Fm43PrGrZGHKJx.jpg",
        "https://assets.hospitable.com/property_images/1605954/sU2roh9n1o0t58XPk5cf2bmP63nmwgkQ0ZlfVdAQ.jpg",
        "https://assets.hospitable.com/property_images/1605954/4PyvDtrdm0DnwRoKTEkICSXOMMyByL0PGduuR5rV.jpg",
        "https://assets.hospitable.com/property_images/1605954/AZ9YZ7rMB8WRpp7pOvx6t9YWQ0If0960t9zBhWot.jpg",
        "https://assets.hospitable.com/property_images/1605954/c4624trQk0k36cdGH3uNWQIloP5GrJ2o5A61TU3p.jpg",
        "https://assets.hospitable.com/property_images/1605954/aGg4YZlyuOd9ghHdXF1utRqLYz0uFPtbG6xiYyUO.jpg",
        "https://assets.hospitable.com/property_images/1605954/xkUlyQmK7TD0pdkREJI6eIPuhdnSx9iKYciok2eR.jpg",
        "https://assets.hospitable.com/property_images/1605954/ZdTJsHrNLvlA5UMy7AQQXOnTp6MC5QGxhqd9E3GR.jpg",
        "https://assets.hospitable.com/property_images/1605954/ZHolndYsOiw0TutPZcOgRYvyZSAbhtpO6tYgLg5q.jpg",
        "https://assets.hospitable.com/property_images/1605954/jRTsXCuJGAxCBDcGO29Wpu7f2Bx8EFvPSBzmVBA8.jpg",
        "https://assets.hospitable.com/property_images/1605954/gvfjc0eeO5AC1y0hHjIM4wwv3zspihsNh48sfIav.jpg",
        "https://assets.hospitable.com/property_images/1605954/3o0T3qXY41yIRQTKwQxxs69f0B2aKe8N906d6J56.jpg"
      ],
      reviews: [
        { author: "High school reunion", date: "April 2026", rating: 5, text: "We took a high school reunion friends trip to this wonderful and relaxing hidden gem. The scenery inside and outside was spot on — we would come back again." },
        { author: "Verified guest", date: "April 2026", rating: 5, text: "Our stay was absolutely wonderful. The home itself was beautiful, peaceful, and perfect for our entire family. Sheena was exceptional — any time I had a question, she responded within minutes." },
        { author: "Family stay", date: "April 2026", rating: 5, text: "Unforgettable stay! Everything exceeded our expectations from start to finish. The décor was beautiful, and the lake setting made it all feel even more special and relaxing." },
        { author: "Birthday weekend", date: "March 2026", rating: 5, text: "We stayed here to celebrate my 36th birthday and everything was perfect! Thank you Sheena for being so accommodating! We will be back." },
        { author: "Verified guest", date: "March 2026", rating: 5, text: "Beautifully maintained and incredibly comfortable. The setting is stunning, with gorgeous views and a peaceful fishing pond. They even had a fire pit down by the water with a full s'mores setup — the kids were in heaven!" },
        { author: "Family of five", date: "March 2026", rating: 5, text: "We had a great time staying here. Plenty of space for our family of 5 with room to spare. Convenient to local restaurants and attractions but still tucked away to provide privacy." }
      ]
    },
    {
      id: "894f145d-0131-4340-bd26-8ce1c084ebe8",
      slug: "gulf-shores-seawind",
      name: "Seawind Sky-View",
      tagline: "Heated Pools, Hot Tub, Sauna & Gym",
      city: "Gulf Shores",
      state: "AL",
      destination: "gulf-shores",
      country: "United States",
      coords: { lat: 30.24873792, lng: -87.68162903 },
      type: "Beachfront Condo",
      capacity: { guests: 8, bedrooms: 3, beds: 4, bathrooms: 2 },
      basePrice: 299,
      cleaningFee: 175,
      petsAllowed: false,
      reviewCount: 26,
      rating: 5.0,
      isGuestFavorite: true,
      summary: "A newly renovated 5th-floor beachfront condo with sweeping Gulf views from the master and living room. Resort-style amenities include heated indoor & outdoor pools, hot tub, sauna, fitness center, and a kiddie splash zone.",
      highlights: [
        "Direct beachfront with private balcony",
        "Heated indoor + outdoor pools",
        "Hot tub, sauna, and full fitness center",
        "Smart TVs in every bedroom",
        "Kiddie splash area + food trucks on site"
      ],
      experiences: [
        "Walk to Lulu's restaurant (Jimmy Buffett's sister's spot)",
        "Sunset cruise on Mobile Bay",
        "Alabama Gulf Coast Zoo (15 min)",
        "Pier fishing at Gulf State Park"
      ],
      amenities: ["Beachfront", "Heated indoor + outdoor pools", "Hot tub", "Sauna", "Fitness center", "Kiddie splash", "Elevator", "Full kitchen", "Smart TVs in every bedroom", "Washer & dryer", "Newly renovated", "AC"],
      images: [
        "https://assets.hospitable.com/property_images/1960828/zvVykCojHbyWjGbyYvsGRu54Dl0jKGtNIVImHu6y.jpg",
        "https://assets.hospitable.com/property_images/1960828/xzlYohixIx58g2euclkJp9KPrMzAI8XgWWiWI6rx.jpg",
        "https://assets.hospitable.com/property_images/1960828/KNWpaCtUlnbvApuAz0rlVclSWuyqVeTEfHKOd6qH.jpg",
        "https://assets.hospitable.com/property_images/1960828/v9M2uqokmnFbSYOEikUlLIoFeSk3mq2s7XcMDvR2.jpg",
        "https://assets.hospitable.com/property_images/1960828/PuSOaSIPWPMKIeq7YUCdgOIZ0Gie8RQwHnB60TPj.jpg",
        "https://assets.hospitable.com/property_images/1960828/bemMbuTeCFcHUNtbCkLdh9JhFNZ2Rjn81VmqyY5h.jpg",
        "https://assets.hospitable.com/property_images/1960828/1EjVtH5ZFIx0aVorWwntg3gDcKC7c2Orfs63QgUN.jpg",
        "https://assets.hospitable.com/property_images/1960828/kBgj94b4RF8EEraixZ1q0yGOa00k1527StNwwyXu.jpg",
        "https://assets.hospitable.com/property_images/1960828/hHFFpyNRdZk0IBDx3EuDz6eBpKz7BdcIq21TrLJm.jpg",
        "https://assets.hospitable.com/property_images/1960828/ahZmPP2GFDvuhw5jkbUwRyrVLszxy32Hx20YHFla.jpg",
        "https://assets.hospitable.com/property_images/1960828/FGmwC3P3S56Un9gi2fGRV14Kuy2QXaAeAaA0URoU.jpg",
        "https://assets.hospitable.com/property_images/1960828/VSQO5i98YVgevDMrFqhkxntwLJmzPNKc16k782OF.jpg"
      ],
      reviews: [
        { author: "Verified guest", date: "April 2026", rating: 5, text: "Sheena was a great host! My fiance and I booked a long weekend to relax and unwind. This property was located in a great area, close to so many restaurants and things to do." },
        { author: "Verified guest", date: "April 2026", rating: 5, text: "Great place, outstanding time and location. Recommended to all, hope to return." },
        { author: "Family stay", date: "April 2026", rating: 5, text: "We had a great time. Got a response immediately to any question. I appreciated the little extra touches like coffee for the adults, and board games for the children." },
        { author: "Verified guest", date: "April 2026", rating: 5, text: "Great place to stay. Super cute condo. The owner was very responsive and accommodating." },
        { author: "Beachfront stay", date: "April 2026", rating: 5, text: "This beachfront home exceeded all our expectations. Just steps from the sand with stunning, unobstructed ocean views as well as walking distance to great restaurants." },
        { author: "Verified guest", date: "April 2026", rating: 5, text: "Beautiful place to enjoy the beach with family! It was clean, nicely decorated, and had everything you needed!" }
      ]
    },
    {
      id: "fa9ff176-3729-4544-875c-06dcb0849b7a",
      slug: "keller-farmhouse",
      name: "King Trail Farmhouse",
      tagline: "Modern Texas Charm, Centrally Located",
      city: "Keller",
      state: "TX",
      destination: "dfw-metroplex",
      country: "United States",
      coords: { lat: 32.9191301, lng: -97.2587564 },
      type: "Modern Farmhouse",
      capacity: { guests: 10, bedrooms: 4, beds: 5, bathrooms: 2.5 },
      basePrice: 259,
      cleaningFee: 200,
      petsAllowed: false,
      reviewCount: 13,
      rating: 5.0,
      isGuestFavorite: true,
      summary: "A thoughtfully designed modern farmhouse where clean lines meet classic Texas charm. Single-level living with a home theater, fireplace, and a relaxed, welcoming atmosphere — perfect for visits to DFW for work, family, or weekend getaways.",
      highlights: [
        "Single-level home — no stairs",
        "Home theater room",
        "Cozy fireplace + gameroom",
        "Designer interior, top-to-bottom",
        "Centrally located: 25 min to DFW airport"
      ],
      experiences: [
        "Stockyards historic district (35 min)",
        "Texas Motor Speedway (15 min)",
        "Globe Life Field — Rangers home (35 min)",
        "Top Golf The Colony"
      ],
      amenities: ["Home theater", "Fireplace", "Game console", "Fully stocked kitchen", "Washer & dryer", "Single-level", "Long term stays", "Workspace", "Dining for 10", "Smart TV", "AC", "Heating"],
      images: [
        "https://assets.hospitable.com/property_images/2121614/J6MQAhLoEeqYTlkOCUCMK6q2dBz29SEVFvZRamYN.jpg",
        "https://assets.hospitable.com/property_images/2121614/3AEbubkMaXA9jgBmHqAwQwbJ8c3ppSAp8TpvGwkq.jpg",
        "https://assets.hospitable.com/property_images/2121614/r4xrtlIkdO0s2IvCQB7tK3hGQKALEto3ymveiwyp.jpg",
        "https://assets.hospitable.com/property_images/2121614/5In4QkCScQaCURwemxn6GXR3wRmSSLBTIcgSvkaq.jpg",
        "https://assets.hospitable.com/property_images/2121614/ZM2ZHoSDsvHYD9NwOou5p0zwX3tzoEG0vNxvYiz8.jpg",
        "https://assets.hospitable.com/property_images/2121614/yPEV52yZOwIswagkjRB5AdHNKScqBrQDuGsqm3sE.jpg",
        "https://assets.hospitable.com/property_images/2121614/tGulGmEs31lmGMPjUnsS9URbCICmnqBTWRPDKjox.jpg",
        "https://assets.hospitable.com/property_images/2121614/ycwUauX60rGITvIlcthsfX9CEVjaU4h1Dqv4EgUa.jpg",
        "https://assets.hospitable.com/property_images/2121614/jUvffC18dt3Yc3sfdkjtmlsmTuHn24tpz5H0mL0F.jpg",
        "https://assets.hospitable.com/property_images/2121614/mCOTE0ho8mpYGYMMKzMHmOFJwQjD0WfaCjM13lMW.jpg",
        "https://assets.hospitable.com/property_images/2121614/9D8Sa1McD1T8PjkSkWYGgV3bjPClIbgjlV5nDO1a.jpg",
        "https://assets.hospitable.com/property_images/2121614/budf6VeCxghKJJJzHSEMYYTRz9I2sgjNvYgYwwlw.jpg"
      ],
      reviews: [
        { author: "From Wisconsin", date: "April 2026", rating: 5, text: "We cannot say enough good things about Sheena's house! It felt like home and was absolutely beautiful. Beds were so comfortable. Music playing when we first arrived made it feel even more like home. Major kitchen envy!" },
        { author: "Business traveler", date: "March 2026", rating: 5, text: "This house is exactly what you see in the photos. Cleanliness was Better Homes and Gardens level. High-end appliances and washer/dryer. Sheena was very accommodating. Definitely stay here again." },
        { author: "Verified guest", date: "March 2026", rating: 5, text: "Awesome house — everything was perfect, from booking, communication, and welcoming environment. We just needed to book for one night but would have stayed more." },
        { author: "Verified guest", date: "March 2026", rating: 5, text: "Beautiful stay, very convenient location with lots to do. Cozy and clean home. Would absolutely stay here again!" },
        { author: "Verified guest", date: "March 2026", rating: 5, text: "I wish every Airbnb owner took as much pride and detail as Sheena does. The comfort and newness and cleanliness." },
        { author: "Family of seven", date: "March 2026", rating: 5, text: "My family said this was the most beautiful Airbnb we have ever seen or stayed in. The place is gorgeous and well designed. Pristine from top to bottom. She thought of everything!" }
      ]
    },
    {
      id: "c1ad6cdb-bc1c-42de-ac8c-418e891bfea9",
      slug: "lone-star-lakehouse",
      name: "Lone Star Lakehouse",
      tagline: "Lakefront on Eagle Mountain Lake",
      city: "Azle",
      state: "TX",
      destination: "dfw-metroplex",
      country: "United States",
      coords: { lat: 32.9443518, lng: -97.5224091 },
      type: "Lakefront Home",
      capacity: { guests: 13, bedrooms: 4, beds: 9, bathrooms: 4 },
      basePrice: 549,
      cleaningFee: 300,
      petsAllowed: true,
      reviewCount: 0,
      rating: 5.0,
      isGuestFavorite: false,
      isNew: true,
      summary: "Wake up to lakefront living at its best on Eagle Mountain Lake. The home sits directly on the water with backyard access, a sand volleyball court, boat dock and ramp, outdoor TV, and an adjoining apartment for extra privacy.",
      highlights: [
        "Direct lakefront — backyard meets the water",
        "Boat dock + ramp included",
        "Sand volleyball court + outdoor games",
        "Outdoor TV + lakeside dining",
        "Adjoining apartment for extra space (sleeps +2)",
        "Arcade gameroom + bunk space upstairs"
      ],
      experiences: [
        "Sunset paddle on Eagle Mountain Lake",
        "Fort Worth Stockyards rodeo night (40 min)",
        "Wakeboarding lessons on the lake",
        "Day trip to Dickies Arena, Fort Worth"
      ],
      amenities: ["Lakefront", "Boat dock & ramp", "Sand volleyball", "Outdoor TV", "Arcade gameroom", "Workspace + balcony", "Pet friendly", "Adjoining apartment option", "BBQ grill", "Fully stocked kitchen", "Washer & dryer"],
      images: [
        "https://assets.hospitable.com/property_images/2265618/rnrh0yaSqGKV3v9Y5ikhR41bxoR8jELShKPxe2fK.jpg",
        "https://assets.hospitable.com/property_images/2265618/LSuO8DTSdUu6pJDIWKizfMSAFrVHLWpEESTkaJfa.jpg",
        "https://assets.hospitable.com/property_images/2265618/asB52UGXCAG31zAUpyZQ6V8uxQy9xTWihPScC5KF.jpg",
        "https://assets.hospitable.com/property_images/2265618/BH683RZY85h4i1Y4NJfcZHb8rJ28LZjjUHiZsVSY.jpg",
        "https://assets.hospitable.com/property_images/2265618/zFTkH0wmxtm0z1sTLaAhjrlYCxzpDtEdngHJn6LW.jpg",
        "https://assets.hospitable.com/property_images/2265618/sgIpvF8emu2CX07bJdRGPfPILiOYGH6sxTuIBA7U.jpg",
        "https://assets.hospitable.com/property_images/2265618/risRmLGHkPZdq9PfzMh1bq5ETaWbuLQqAhdw9eoD.jpg",
        "https://assets.hospitable.com/property_images/2265618/yzPl9ZdoPmZVPLeKPZIiPxqtpsop3hPqNBU4AJuo.jpg",
        "https://assets.hospitable.com/property_images/2265618/DiSraYdHIAYNpLh30oEaaJDnNd1PkyfxEEOJb5Gt.jpg",
        "https://assets.hospitable.com/property_images/2265618/vZ6Qw708I0C6W1jFOzivdDP6jIqvt5e2B4n8QO4g.jpg",
        "https://assets.hospitable.com/property_images/2265618/UiL5pHZjoVYsGrY6fzbvP2o6ZheBenL4PQSwHHGS.jpg",
        "https://assets.hospitable.com/property_images/2265618/QYMIQhrj3f9y8Uh94kP5NqAiIA6Hc9s7uavvKenq.jpg"
      ],
      reviews: []
    }
  ],
  faqs: [
    { q: "Why book directly with Nyris Retreats?", a: "You skip the platform service fees you'd pay on Airbnb or Vrbo (typically 14-18% of your booking). You also get direct access to your host, faster responses, and exclusive direct-booking perks like flexible check-in windows when available." },
    { q: "Are the homes really Top 1% Guest Favorites?", a: "Yes. Every property is a designated Airbnb Guest Favorite — the top 1% of homes worldwide based on ratings, reliability, and quality of stay. We've hosted 200+ stays at a 5.0 average across our portfolio." },
    { q: "What does \"Superhost-managed\" mean for my stay?", a: "Each property is personally managed by Sheena, an experienced Superhost. That means rapid responses (most within minutes), 24/7 support during your stay, freshly cleaned linens, fully stocked starter pantries, and thoughtful local recommendations sent before you arrive." },
    { q: "Can I bring my pets?", a: "Some properties welcome small dogs (Crystal Beach, Lone Star Lakehouse). Pet fees and limits are listed on each property page. Service animals are always welcome." },
    { q: "What's your cancellation policy?", a: "We offer a flexible cancellation window: full refund up to 14 days before check-in, 50% refund 7-14 days before. Refer to your specific booking confirmation for exact terms." },
    { q: "Do you offer discounts for long stays?", a: "Yes — weekly stays receive 10% off, and 28+ night stays receive 20% off. Discounts are applied automatically at booking." },
    { q: "What about group, corporate, or wedding bookings?", a: "Reach out via the inquiry form. We have several large-capacity properties (12-13 guests) and can coordinate multi-property bookings for larger groups." },
    { q: "Is there a security deposit or hidden fee?", a: "No hidden fees. We charge a transparent cleaning fee shown at booking and a refundable damage deposit (held, not charged) for some properties. Everything is itemized before you confirm." }
  ]
};

if (typeof module !== "undefined") module.exports = NYRIS;
