/**
 * 数据摘要使用的小红书笔记与评论类型。
 */

export interface XhsNote {
       note_id: string;
       title: string;
       desc: string;
       type: string;
       liked_count: number;
       collected_count: number;
       comments_count: number;
       shared_count: number;
       user_nickname: string;
}

export interface XhsComment {
       comment_id: string;
       content: string;
       like_count: number;
       user_nickname: string;
       ip_location: string;
}
