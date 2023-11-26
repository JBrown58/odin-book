'use server';
import { z } from 'zod';
import { getServerSession } from 'next-auth';
import prisma from './prisma';
import { authOptions } from '../api/auth/[...nextauth]/authOptions';
import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { FriendshipStatus } from '@prisma/client';
import { useSearchParams } from 'next/navigation';
import { redirect } from 'next/navigation';

export const getUserId = async () => {
  try {
    const session = await getServerSession(authOptions);
    const userId = session?.user.id;
    if (userId === undefined) throw new Error('Unable to find user');

    return userId;
  } catch (error) {
    throw new Error(`Error finding current user`);
  }
};

export async function updateProfile(prevState: any, formData: FormData) {
  try {
    const ProfileSchema = z.object({
      bio: z.string().optional(),
      gender: z.string().optional(),
      dateOfBirth: z.string().optional(),
    });

    const userId = await getUserId();

    let profile;

    const form = {
      bio: formData.get('bio'),
      gender: formData.get('gender'),
      dateOfBirth: formData.get('dateOfBirth'),
    };

    const parsedForm = ProfileSchema.parse(form);
    const parsedDateOfBirth = new Date(parsedForm.dateOfBirth ?? '');
    const isoDateString = parsedDateOfBirth.toISOString();

    const userProfile = {
      bio: parsedForm.bio,
      gender: parsedForm.gender,
      dateOfBirth: isoDateString,
      userId: userId,
    };

    const user = await prisma.user.findUnique({
      where: {
        id: userId,
      },
    });

    if (user === null) return NextResponse.json({ message: 'Unable to find user' });

    if (user.profileId === null) {
      let createUser = await prisma.profile.create({ data: userProfile });
      const updateUser = await prisma.user.update({
        where: {
          id: userId,
        },
        data: {
          profileId: createUser.id,
        },
      });
      profile = updateUser;
    } else {
      const updateProfile = await prisma.profile.update({
        where: {
          userId: userId,
        },
        data: userProfile,
      });
      profile = updateProfile;
    }
    revalidatePath('/profile');

    return { message: `Profile updated`, profile: profile };
  } catch (e) {
    return { message: `Unable to update profile` };
  }
}

export async function getProfile(userId: number) {
  try {
    const userProfile = await prisma.profile.findUnique({
      where: {
        userId: userId,
      },
      include: {
        user: true,
      },
    });
    return userProfile;
  } catch (error) {
    return { message: `Unable to find profile` };
  }
}

export async function getFriends() {
  const userId = await getUserId();

  const userFriends = await prisma.friend.findMany({
    where: {
      OR: [{ user1Id: userId }, { user2Id: userId }],
    },
    orderBy: {
      status: 'asc',
    },
  });

  const friendIds = userFriends.flatMap(friend =>
    friend.user1Id === userId ? [friend.user2Id] : [friend.user1Id]
  );

  const uniqueFriendIds = Array.from(new Set(friendIds));

  const friends = await prisma.user.findMany({
    where: {
      id: {
        in: uniqueFriendIds,
      },
    },
    include: {
      sentMessages: true,
      receivedMessages: true,
    },
  });

  const combinedFriendsData = uniqueFriendIds.map(friendId => {
    const friendData = friends.find(friend => friend.id === friendId);
    const userFriend = userFriends.find(
      friend => friend.user1Id === friendId || friend.user2Id === friendId
    );
    return friendData ? { ...userFriend, ...friendData } : userFriend;
  });

  return combinedFriendsData;
}

export async function getUsers() {
  try {
    const userId = await getUserId();

    const users = await prisma.user.findMany({
      where: {
        id: {
          not: userId,
        },
      },
      include: {
        friendsAsUser1: true,
      },
    });

    return { users, userId };
  } catch (error) {
    return { message: `Unable to get all users` };
  }
}

export async function searchUsers(query: string) {
  try {
    const userId = await getUserId();
    const users = await prisma.user.findMany({
      where: {
        name: {
          contains: query,
          mode: 'insensitive',
        },
        AND: {
          id: {
            not: userId,
          },
        },
      },
      include: {
        friendsAsUser1: true,
      },
    });
    return users;
  } catch (error) {
    return { message: `Unable to search for friends` };
  }
}

export async function addFriend(friendUserId: number) {
  try {
    const userId = await getUserId();

    const friendToCreate = {
      user1Id: userId,
      user2Id: friendUserId,
      status: FriendshipStatus.PENDING,
    };

    const existingFriend = await prisma.friend.findFirst({
      where: {
        user1Id: userId,
        user2Id: friendUserId,
        status: FriendshipStatus.PENDING,
      },
    });

    if (existingFriend !== null) throw new Error('Friend Already Added');

    const updateFriends = await prisma.friend.create({ data: friendToCreate });
    revalidatePath('/friends');
    return updateFriends;
  } catch (error) {
    return console.error(error);
  }
}

export async function changeStatus(userFriendId: number, action: 'accept' | 'remove') {
  try {
    const userId = await getUserId();

    const friend = await prisma.friend.findFirst({
      where: {
        OR: [
          {
            AND: [{ user1Id: userId }, { user2Id: userFriendId }],
          },
          {
            AND: [{ user1Id: userFriendId }, { user2Id: userId }],
          },
        ],
      },
    });
    if (!friend) {
      throw new Error('Friend relationship not found.');
    }

    let changedFriend;

    switch (action) {
      case 'accept':
        changedFriend = await prisma.friend.update({
          where: {
            id: friend.id,
          },
          data: {
            status: 'ACCEPTED',
          },
        });
        revalidatePath('/friends');
        return changedFriend;

      case 'remove':
        changedFriend = await prisma.friend.delete({
          where: {
            id: friend.id,
          },
        });
        const deletedMessages = await prisma.message.deleteMany({
          where: {
            OR: [
              {
                senderId: userId,
                receiverId: userFriendId,
              },
              {
                senderId: userFriendId,
                receiverId: userId,
              },
            ],
          },
        });

        revalidatePath('/friends');
        return changedFriend;

      default:
        throw new Error('Invalid action specified.');
    }
  } catch (error) {
    return { message: `Unable to change friend status` };
  }
}

export async function deletePost(postId: number) {
  try {
    const deletedPost = await prisma.post.delete({
      where: {
        id: postId,
      },
    });

    revalidatePath('/for-you?page=1');
    return deletedPost;
  } catch (error) {
    return { message: `Post unsuccessfully deleted` };
  }
}

export async function createPost(prevState: any, formData: FormData) {
  try {
    const userId = await getUserId();

    const postSchema = z.object({
      content: z.string(),
      createdAt: z.date(),
      imageUrl: z.string().optional(),
    });

    const form = {
      content: formData.get('post'),
      authorId: userId,
      createdAt: new Date(),
      imageUrl: formData.get('image-url'),
    };

    const parsedForm = postSchema.parse(form);

    const postData = {
      content: parsedForm.content,
      authorId: userId,
      createdAt: parsedForm.createdAt,
      imageUrl: form.imageUrl === '' ? null : parsedForm.imageUrl,
    };

    const createdPost = await prisma.post.create({
      data: postData,
    });
    revalidatePath('/');
    return { ...createdPost, success: true };
  } catch (error) {
    return { message: `Unable to create Post` };
  }
}

export async function likePost(postId: number) {
  try {
    const userId = await getUserId();

    const post = await prisma.post.findUnique({
      where: {
        id: postId,
      },
      include: {
        likes: true,
      },
    });

    const totalLikes = post?.likes.length;

    const userLike = await prisma.postLike.findMany({
      where: {
        authorId: userId,
        postId: postId,
      },
    });

    if (userLike.length > 0) {
      const deletedLike = await prisma.postLike.delete({
        where: {
          id: userLike[0].id,
        },
      });
    } else {
      const likeData = {
        authorId: userId,
        postId: postId,
        createdAt: new Date(),
      };

      const createdLike = await prisma.postLike.create({
        data: likeData,
      });
    }
    revalidatePath('/');
  } catch (error) {
    return { message: `Unable to like post` };
  }
}

export async function likeComment(commentId: number, postId: number) {
  try {
    const userId = await getUserId();

    const userLike = await prisma.commentLike.findMany({
      where: {
        authorId: userId,
        commentId: commentId,
        postId: postId,
      },
    });

    if (userLike.length > 0) {
      const deletedLike = await prisma.commentLike.delete({
        where: {
          id: userLike[0].id,
        },
      });
    } else {
      const likeData = {
        authorId: userId,
        commentId: commentId,
        createdAt: new Date(),
        postId: postId,
      };

      const createdLike = await prisma.commentLike.create({
        data: likeData,
      });
    }

    revalidatePath('/');
  } catch (error) {
    return { message: `Unable to like comment` };
  }
}

export async function createComment(prevState: any, formData: FormData) {
  try {
    const userId = await getUserId();

    const commentSchema = z.object({
      content: z.string(),
      postId: z.string().transform(str => Number(str)),
    });

    const form = {
      content: formData.get('comment'),
      authorId: userId,
      postId: formData.get('postId'),
      createdAt: new Date(),
    };
    const parsedForm = commentSchema.parse(form);

    const commentData = {
      content: parsedForm.content,
      authorId: userId,
      postId: parsedForm.postId,
      createdAt: new Date(),
    };

    const createdComment = await prisma.comment.create({
      data: commentData,
    });
    revalidatePath('/');
    return createdComment;
  } catch (error) {
    return { message: `Messages unsuccessfully created` };
  }
}

export async function deleteComment(commentId: number) {
  try {
    const result = await prisma.$transaction(async prisma => {
      await prisma.commentLike.deleteMany({
        where: {
          commentId: commentId,
        },
      });

      return await prisma.comment.delete({
        where: {
          id: commentId,
        },
      });
    });

    revalidatePath('/');
    return result;
  } catch (error) {
    return { message: `Comment unsuccessfully deleted` };
  }
}

export async function getMessages(receiverId: number) {
  try {
    const userId = await getUserId();

    const messages = await prisma.message.findMany({
      where: {
        OR: [
          {
            senderId: userId,
            receiverId: receiverId,
          },
          {
            senderId: receiverId,
            receiverId: userId,
          },
        ],
      },

      orderBy: {
        createdAt: 'asc',
      },
    });

    const senderResult = await prisma.user.findUnique({
      where: {
        id: userId,
      },
    });

    const recipientResult = await prisma.user.findUnique({
      where: {
        id: receiverId,
      },
    });

    const sender = senderResult ? senderResult.name : null;
    const recipient = recipientResult ? recipientResult.name : null;
    const profilePicture = recipientResult ? recipientResult.profilePicture : null;

    return { messages, sender, recipient, profilePicture };
  } catch (error) {
    return { message: `Messages unsuccessfully fetched` };
  }
}

export async function createMessage(prevState: any, formData: FormData) {
  try {
    const userId = await getUserId();
    if (userId === undefined) throw new Error('Unable to find user');

    const messageSchema = z.object({
      content: z.string(),
      receiverId: z.string().transform(str => Number(str)),
    });

    const form = {
      content: formData.get('message'),
      senderId: userId,
      receiverId: formData.get('receiverId'),
      createdAt: new Date(),
      read: false,
    };

    const parsedForm = messageSchema.parse(form);

    const messageData = {
      content: parsedForm.content,
      senderId: userId,
      receiverId: parsedForm.receiverId,
      createdAt: new Date(),
      read: false,
    };

    const createdMessage = await prisma.message.create({
      data: messageData,
    });
    revalidatePath(`/`);
    return createdMessage;
  } catch (error) {
    return { message: `Message unsuccessfully created` };
  }
}

export async function deleteMessage(messageId: number, receiverId: number) {
  try {
    const message = await prisma.message.delete({
      where: {
        id: messageId,
      },
    });
    revalidatePath(`/messages/${receiverId}`);
    return message;
  } catch (error) {
    return { message: `Message unsuccessfully deleted` };
  }
}

export async function updateMessage(prevState: any, formData: FormData) {
  try {
    const userId = await getUserId();

    if (userId === undefined) throw new Error('Unable to find user');

    const messageSchema = z.object({
      message: z.string(),
      receiverId: z.string().transform(str => Number(str)),
      messageId: z.string().transform(str => Number(str)),
    });

    const form = {
      message: formData.get('message'),
      senderId: userId,
      receiverId: formData.get('receiverId'),
      messageId: formData.get('messageId'),
    };

    const parsedForm = messageSchema.parse(form);

    const messageData = {
      messageId: parsedForm.messageId,
      content: parsedForm.message,
      senderId: userId,
      receiverId: parsedForm.receiverId,
      createdAt: new Date(),
      read: true,
    };

    const updatedMessage = await prisma.message.update({
      where: {
        id: parsedForm.messageId,
      },
      data: {
        content: parsedForm.message,
        read: true,
      },
    });
    revalidatePath(`/messages?userId=${userId}&receiverId=${form.receiverId}`);
    return updatedMessage;
  } catch (error) {
    return { message: `Message unsuccessfully updated` };
  }
}

export async function getFile(formData: FormData) {
  'use server';
  const file = formData.get('file') as File;
  console.log('File name:', file.name, 'size:', file.size);
}

export async function getPosts(page = 1) {
  try {
    const userId = await getUserId();
    if (userId === undefined) throw new Error();
    const userFriends = await prisma.friend.findMany({
      where: {
        OR: [{ user1Id: userId }, { user2Id: userId }],
      },
    });
    const pageNumber = isNaN(page) || page < 1 ? 1 : page; // Default to page 1 if invalid
    const take = 5;
    const skip = (pageNumber - 1) * take;

    const userfriendIds = userFriends.map(friend =>
      friend.user1Id === userId ? friend.user2Id : friend.user1Id
    );
    // Fetch timeline posts with pagination
    const timelinePosts = await prisma.post.findMany({
      where: {
        authorId: {
          in: [userId, ...userfriendIds],
        },
      },
      take: take,
      skip: skip,
      orderBy: {
        createdAt: 'desc',
      },
      include: {
        author: true,
        likes: true,
        comments: {
          include: {
            author: true,
            commentLikes: true,
          },
        },
      },
    });
    // Fetch other timeline posts with pagination
    const otherTimeLinePosts = await prisma.post.findMany({
      where: {
        authorId: {
          not: {
            in: [userId, ...userfriendIds],
          },
        },
      },
      take: take,
      skip: skip,
      orderBy: {
        createdAt: 'desc',
      },
      include: {
        author: true,
        likes: true,
        comments: {
          include: {
            author: true,
            commentLikes: true,
          },
        },
      },
    });

    // Get total count of timeline posts
    const timelinePostsCount = await prisma.post.count({
      where: {
        authorId: {
          in: [userId, ...userfriendIds],
        },
      },
    });

    // Get total count of other timeline posts
    const otherTimelinePostsCount = await prisma.post.count({
      where: {
        authorId: {
          not: {
            in: [userId, ...userfriendIds],
          },
        },
      },
    });

    return {
      timelinePosts,
      otherTimeLinePosts,
      timelinePostsCount,
      otherTimelinePostsCount,
      userId,
    };
  } catch (error) {
    return { message: 'Unable to fetch posts' };
  }
}

export async function getUserPosts(page: number, userId: number) {
  try {
    const pageNumber = isNaN(page) || page < 1 ? 1 : page; // Default to page 1 if invalid
    const take = 5;

    const skip = (pageNumber - 1) * take;
    const userPosts = await prisma.post.findMany({
      where: {
        authorId: userId,
      },
      take: take,
      skip: skip,
      orderBy: {
        createdAt: 'desc',
      },
    });

    const postsCount = await prisma.post.count({
      where: {
        authorId: userId,
      },
    });

    if (userPosts === undefined)
      return {
        userPosts: [],
        postsCount: 0,
      };

    return { userPosts, postsCount };
  } catch (error) {
    return { message: 'Unable to fetch user posts' };
  }
}

export async function getUnreadMessagesCount() {
  try {
    const userId = await getUserId();
    const unreadMessageCount = await prisma.message.count({
      where: {
        AND: {
          receiverId: userId,
          read: false,
        },
      },
    });
    return unreadMessageCount;
  } catch (error) {
    return { message: 'Unable to fetch unread message count' };
  }
}

export async function setReadMessages(receiverId: number) {
  try {
    const userId = await getUserId();
    const receivedMessages = await prisma.message.updateMany({
      where: {
        receiverId: userId,
        senderId: receiverId,
        read: false,
      },
      data: {
        read: true,
      },
    });
    revalidatePath('/for-you');
    return receivedMessages;
  } catch (error) {
    return { message: 'Unable to set messages as read' };
  }
}
